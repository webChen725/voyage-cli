'use strict';
const fs = require("fs");
const path = require("path");
const inquirer = require("inquirer");
const fse = require("fs-extra");
const ejs = require("ejs");
const glob = require("glob");
const semver = require("semver");
const userHome = require("user-home");
const { log, Package, Command, spinnerStart, sleep, execAsync } = require("@voyage-cli/utils");
const getProjectTemplate = require("./getProjectTemplate");

const TYPE_PROJECT = "project";
const TYPE_COMPONENT = "component";
const TEMPLATE_TYPE_NORMAL = "normal";
const TEMPLATE_TYPE_CUSTOM = "custom";

const WIHTE_COMMAND = ["npm", "cnpm", "yarn"];  // 白名单命令
const DEFAULT_INSTALL_CMD = "npm install";
const DEFAULT_START_CMD = "npm run dev";

class InitCommand extends Command {
    init(){
        this.projectName = this._argv.projectName || "";
        this.force = !!this._argv.force;
        log.verbose("projectName: ", this.projectName);
        log.verbose("force: ", this.force);
    }

    async exec(){
        try {
            // 1. 准备阶段
            const projectInfo = await this.prepare();
            if(projectInfo){
                log.verbose("projectInfo: ", projectInfo)
                this.projectInfo = projectInfo;
                // 2. 下载模版
                await this.downloadTemplate();
                // 3. 安装模版
                await this.installTemplate();
            }
        }catch(e){
            log.error(e.message);
            if(process.env.LOG_LEVEL === "verbose"){
                console.log(e);
            }
        }
    }

    /**
     * 安装模版
     */
    async installTemplate(){
        log.verbose("templateInfo: ", this.templateInfo);
        if(this.templateInfo){
            if(!this.templateInfo.type){
                this.templateInfo.type = TEMPLATE_TYPE_NORMAL;
            }
            if(this.templateInfo.type === TEMPLATE_TYPE_NORMAL){
                // 标准安装
                await this.installNormalTemplate()
            } else if (this.templateInfo.type === TEMPLATE_TYPE_CUSTOM){
                // 自定义安装
                await this.installCustomTemplate();
            } else {
                throw new Error("无法识别项目模版类型！");
            }
        }else{
            throw new Error("项目模版信息不存在!");
        }
    }

    /**
     * 检测执行的命令是否存在白名单中
     */
    checkCommand(cmd){
        if(WIHTE_COMMAND.includes(cmd)){
            return cmd;
        }
        return null;
    }

    /**
     * 执行命令
     */
    async execCommand(command, errorMsg){
        let ret;
        if(command) {
            const cmdArray = command.split(" ");
            const cmd = this.checkCommand(cmdArray[0]);
            if(!cmd){
                throw new Error("命令不存在!命令：" + command);
            }
            const args = cmdArray.slice(1);
            ret = await execAsync(cmd, args, {
                stdio: "inherit",
                cwd: process.cwd()
            })
        }
        if(ret !== 0){
            throw new Error(errorMsg);
        }
        return ret;
    }

    /**
     * 在执行安装之前，进行ejs模版渲染
     */
    async ejsRender(options){
        const dir = process.cwd();
        const projectInfo = this.projectInfo;
        return new Promise((resolve, reject) => {
            glob("**", {
                cwd: dir,
                nodir: true,
                ignore: options.ignore || ''
            }, (err, files) => {
                if(err){
                    reject(err);
                    return;
                }
                Promise.all(files.map(file => {
                    const filePath = path.join(dir, file);
                    return new Promise((resolve1, reject1) => {
                        ejs.renderFile(filePath, projectInfo, {}, (err, result) => {
                            if(err){
                                reject1(err);
                            } else {
                                fse.writeFileSync(filePath, result);
                                resolve1(result);
                            }
                        })
                    })
                })).then(() => {
                    resolve();
                }).catch(err => {
                    reject(err);
                })
            })
        })
    }

    /**
     * 标准安装
     */
    async installNormalTemplate() {
        // 拷贝模版到当前目录
        let spinner = spinnerStart("正在安装模版...");
        try {
            const templatePath = path.resolve(this.templateNpm.cacheFilePath, "template");
            const targetPath = process.cwd();
            fse.ensureDirSync(templatePath);
            fse.ensureDirSync(targetPath);
            fse.copySync(templatePath, targetPath);
        } catch(e) {
            throw e;
        } finally {
            spinner.stop(true);
            log.success("模版安装成功!")
        }
        const templateIgnore = this.templateInfo.ignore || [];
        const ignore = ['**/node_modules/**', ...templateIgnore]
        await this.ejsRender({ ignore });
        let { installCommand, startCommand } = this.templateInfo;
        installCommand = installCommand ? installCommand : DEFAULT_INSTALL_CMD;
        startCommand = startCommand ? startCommand : DEFAULT_START_CMD;
        // 依赖安装
        await this.execCommand(installCommand, "依赖安装过程失败!");
        // 项目启动
        await this.execCommand(startCommand, "项目启动失败！");
    }

    /**
     * 自定义安装
     */
    async installCustomTemplate() {
        if(await this.templateNpm.exists()){
            const rootFile = this.templateNpm.getRootFilePath();
            if(fs.existsSync(rootFile)){
                log.notice("开始执行自定义模版.");
                const templatePath = path.resolve(this.templateNpm.cacheFilePath, "template");
                const options = {
                    templateInfo: this.templateInfo,
                    projectInfo: this.projectInfo,
                    sourcePath: templatePath,
                    targetPath: process.cwd()
                };
                const code = `require('${rootFile}')(${JSON.stringify(options)})`;
                log.verbose("code: ", code);
                await execAsync('node', ['-e', code], {
                    stdio: 'inherit',
                    cwd: process.cwd()
                });
                log.success("自定义模版安装成功!")
            }else{
                throw new Error("自定义模版入口不存在！")
            }
        }
    }

    /**
     * 获取项目模版
     */
    async downloadTemplate(){
        const { projectTemplate, customTemplate } = this.projectInfo;
        let templateInfo;
        if(!customTemplate){
            templateInfo = this.template.find(item => item.npmName === projectTemplate);
        } else {
            templateInfo = projectTemplate;
        }
        const targetPath = path.resolve(userHome, ".voyage-cli", "template");
        const storeDir = path.resolve(userHome, ".voyage-cli", "template", "node_modules");
        const { npmName, version } = templateInfo;
        const templateNpm = new Package({
            targetPath,
            storeDir,
            name: npmName,
            version: version
        })
        this.templateNpm = templateNpm;
        this.templateInfo = templateInfo;
        if(!await templateNpm.exists()){
            const spinner = spinnerStart("正在下载模版...");
            await sleep();
            try{
                await templateNpm.install();
            }catch(e){
                throw e;
            }finally{
                spinner.stop(true);
                if(await templateNpm.exists()){
                    log.success("下载模版成功");
                }
            }
        }else{
            const spinner = spinnerStart("正在更新模版...");
            await sleep();
            try{
                await templateNpm.update();
            }catch(e){
                throw e;
            }finally{
                spinner.stop(true);
                if(await templateNpm.exists()){
                    log.success("更新模版成功");
                }
            }
        }
    }

    /**
     * 执行创建项目准备阶段
     */
    async prepare(){
        // 0. 判断项目模版是否存在
        const template = getProjectTemplate();
        if(!template || template.length === 0){
            throw new Error("当前项目模版不存在");
        }
        this.template = template;
        // 1. 判断当前目录是否为空
        const localPath = process.cwd();
        if(!this.isDirEmpty(localPath)){
            let ifContinue = false;
            if(!this.force){
                // 1.1: 询问是否继续创建
                ifContinue = (await inquirer.prompt({
                    type: "confirm",
                    name: "ifContinue",
                    message: "当前文件夹不为空，是否继续创建项目?"
                })).ifContinue;
                if(!ifContinue){
                    return;
                }
            }
            // 2. 是否启动强制更新
            if (ifContinue || this.force){
                // 给用户进行二次确认
                const { confirmDelete } = await inquirer.prompt({
                    type: "confirm",
                    name: "confirmDelete",
                    message: "是否确认清空当前目录下的文件?"
                });
                if(confirmDelete){
                    // 清空当前目录
                    fse.emptyDirSync(localPath);
                }
            }
        }
        return await this.getProjectInfo();
    }

    /**
     * 获取创建项目的基本信息
     */
    async getProjectInfo(){
        function isValidName(v){
            return /^[a-zA-Z]+([-][a-zA-Z][a-zA-Z0-9]*|[_][a-zA-Z][a-zA-Z0-9]*|[a-zA-Z0-9])*$/.test(v)
        }
        let projectInfo = {
            customExtra: {}
        };
        let isProjectNameValid = false;
        if(isValidName(this.projectName)){
            isProjectNameValid = true;
            projectInfo.projectName = this.projectName;
        }
        // 1. 选择创建项目或者组建
        const { type } = await inquirer.prompt({
            type: "list",
            name: "type",
            message: "请选择初始化类型",
            default: TYPE_PROJECT,
            choices: [{
                name: "项目",
                value: TYPE_PROJECT
            }, {
                name: "组件",
                value: TYPE_COMPONENT
            }]
        })
        log.verbose("type: ", type);
        this.template = this.template.filter(template => template.tag.includes(type))
        const title = type === TYPE_PROJECT ? "项目" : "组件";
        const projectNamePrompt = {
            type: "input",
            name: "projectName",
            message: `请输入${title}名称`,
            default: "",
            validate: function(v){
                const done = this.async();
                setTimeout(function(){
                    // 1. 输入的首字符必须为英文字符
                    // 2. 尾字符必须为英文或者数字， 不能为字符
                    // 3. 字符仅允许"_,-"
                    if(!isValidName(v)){
                        done(`请输入合法的${title}名称(首字符必须为英文字符，尾字符必须为英文或数字字符，仅接受'-,_'特殊字符)`);
                        return;
                    }
                    done(null, true);
                }, 0)
            }
        }
        const projectPrompt = [];
        if(!isProjectNameValid){
            projectPrompt.push(projectNamePrompt);
        }
        projectPrompt.push(
            {
                type: "input",
                name: "projectVersion",
                message: `请输入${title}版本号`,
                default: "1.0.0",
                validate: function(v){
                    const done = this.async();
                    setTimeout(function(){
                        if(!(!!semver.valid(v))){
                            done("请输入合法的版本号");
                            return;
                        }
                        done(null, true);
                    }, 0)
                },
                filter: function(v){
                    if(!!semver.valid(v)){
                        return semver.valid(v)
                    }
                    return v;
                }
            }
        );
        const customTemplateInfo = await this.checkCustomTemplate();
        if(!customTemplateInfo){
            projectPrompt.push({
                type: 'list',
                name: "projectTemplate",
                message: `请选择${title}模版`,
                choices: this.createTemplateChoice()
            })
        } else {
            projectInfo.projectTemplate = customTemplateInfo;
            projectInfo.customExtra = customTemplateInfo.extra || {};
            projectInfo.customTemplate = true;
        }
        if(type === TYPE_PROJECT){
            // 2. 获取项目的基本信息
            const project = await inquirer.prompt(projectPrompt);
            projectInfo = {
                ...projectInfo,
                ...projectInfo.customExtra,
                type,
                ...project
            }
        }else if(type === TYPE_COMPONENT){
            const descriptionPrompt = {
                type: "input",
                name: "componentDescription",
                message: `请输入${title}描述信息`,
                default: "",
                validate: function(v){
                    const done = this.async();
                    setTimeout(function(){
                        if(!v){
                            done(`${title}描述信息不能为空!`);
                            return;
                        }
                        done(null, true);
                    }, 0)
                }
            }
            projectPrompt.push(descriptionPrompt);
            // 获取组件基本信息
            const component = await inquirer.prompt(projectPrompt);
            projectInfo = {
                ...projectInfo,
                type,
                ...component
            }
        }

        // 对项目名称进行处理，生成classname
        if(projectInfo.projectName){
            projectInfo.className = require("kebab-case")(projectInfo.projectName).replace(/^-/, "");
        }
        if(projectInfo.projectVersion){
            projectInfo.version = projectInfo.projectVersion;
        }
        if(projectInfo.componentDescription){
            projectInfo.description = projectInfo.componentDescription;
        }
        // return 项目的基本信息(object)
        return projectInfo;
    }

    // 检查是否在.voyage-cli文件中进行了下载模版的自定义
    checkCustomTemplate = async () => {
        const configPath = path.resolve(process.cwd(), ".voyage-cli.js");
        if(fs.existsSync(configPath)){
            const templateConfig = require(configPath).customTemplate;
            if(templateConfig){
                const { npmName, version } = templateConfig;
                if(!(npmName && version)){
                    throw new Error("自定义项目安装模版时需要同时给出项目的npm名称和version版本号");
                }
            }
            return templateConfig;
        }
        return null;
    }

    /**
     * 创建选择项目模版的choice
     */
    createTemplateChoice(){
        return (this.template || []).map(item => ({
            value: item.npmName,
            name: item.name
        }))
    }

    /**
     * 判断目录下是否为空
     */
    isDirEmpty(localPath){
        let fileList = fs.readdirSync(localPath);
        // 文件过滤的逻辑
        fileList = fileList.filter(file => (
            !file.startsWith(".") && ["node_modules"].indexOf(file) < 0
        ));
        return !fileList || fileList.length <= 0;
    }
}

function init(argv) {
    return new InitCommand(argv)
}

module.exports = init;

module.exports.InitCommand = InitCommand;