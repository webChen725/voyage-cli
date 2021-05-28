'use strict';
const fse = require("fs-extra");
const fs = require("fs");
const path = require("path");
const url = require("url");
const SimpleGit = require("simple-git");
const userHome = require("user-home");
const ejs = require("ejs");
const { log, Command, ssh } = require("voyage-cli-utils");
const { Connect, uploadFileToServer, execCommand, closeConn } = ssh;
const inquirer = require("./inquirer");

const BASE_GITHUB_URL = "https://github.com/";
const BASE_GITEE_URL = "https://gitee.com/";
const OS_OPTIONS = [{name: "CentOS", value: "centos"}, {name: "Ubuntu", value: "ubuntu"}];
const WORK_PATH = "/usr/project";
const SERVER_CACHE = ".voyage-cli";
const DEFAULT_CACHE_DIR = ".voyage-cli/publish";  // 默认配置文件在本地的缓存目录
const DEFAULT_BUILD_OUT_PATH = "dist";  // 默认执行项目构建之后项目的输出目录,可以通过.voyage-cli配置文件进行配置  // ./docs/.vuepress/dist
const DEFAULT_PULL_BRANCH = "master";  // 在远程服务器git pull项目时候，拉取的默认远程分支
const DEFAULT_BUILD_CMD = "npm run build";  // 服务器构建项目命令


class PublishCommand extends Command {
    // 命令初始化
    init = async () => {
        try {
            await this.prepare();
        }catch(err){
            log.error("项目发布执行出错");
            if(this._argv.debug){
                log.error(err.stack);
            }
            process.exit(0);
        }
    }

    // 执行初始化准备
    prepare = async () => {
        await this.checkInit();
        await this.checkInitOptions();
        await this.checkGitOrigin();
        await this.checkGitBranch();
        await this.checkProjectInfo();
        await this.checkExposePort();
        await this.handleConfigFile();
    }

    // 基础信息检测
    checkInit = async () => {
        if(!fs.existsSync(userHome)){
            throw new Error("用户主目录不存在");
        }
    }

    // 检测是否存在配置文件: 配置文件为 .voyage-cli, 并生成相应的ssh配置
    checkInitOptions = async () => {
        const configPath = path.resolve(process.cwd(), ".voyage-cli.js");
        function isValidIP(ip) {
            var reg = /^(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])$/
            return reg.test(ip);
        }
        let configData = {};
        if(fs.existsSync(configPath)){
            configData = require(configPath).ssh || {};
        }
        const { sourceIp, username, password, os, exposePort,
            serverName, forceClean, nginxPath, dockerFilePath, buildCommand, buildOutPath
        } = configData;
        const host = sourceIp ? (() => {
            if(isValidIP(sourceIp)) return sourceIp;
            throw new Error("配置文件中的远程IP地址不合法");
        })() : await inquirer({
            type: 'text',
            message: "请输入远程服务器IP地址",
            defaultValue: "",
            validate: function(v){
                const done = this.async();
                setTimeout(function(){
                    if(!isValidIP(v)){
                        done(`请输入合法的服务器IP地址`);
                        return;
                    }
                    done(null, true);
                }, 0)
            }
        });
        const user = username ? username : await inquirer({
            type: "text",
            message: "请输入登录服务器用户名",
            defaultValue: "root"
        });
        const pass = password ? password : await inquirer({
            type: "password",
            message: "请输入登录服务器密码",
            defaultValue: ""
        });
        const system = os ? (() => {
            const osList = OS_OPTIONS.map(item => item.value);
            if(osList.includes(os)) return os;
            throw new Error(`配置文件中的服务器系统暂不支持！目前可选的服务器系统：${osList.join(",")}`)
        })() : await inquirer({
            type: 'list',
            message: "请选择服务器系统",
            choices: OS_OPTIONS
        });
        const clean = forceClean ? forceClean : await inquirer({
            type: "confirm",
            message: "是否需要在此次构建时强制删除已存在的项目文件?",
            defaultValue: false
        });
        this.sshOptions = {
            host,
            username: user,
            password: pass,
            os: system,
            exposePort: exposePort || 3000,
            serverName: serverName,
            forceClean: clean,
            nginxPath,
            dockerFilePath,
            buildCommand: this.checkBuildCmdValid(buildCommand),
            buildOutPath
        }
        log.verbose("sshOptions", this.sshOptions);
    }

    // 检测构建命令是否合法
    checkBuildCmdValid = (cmd) => {
        if (cmd) {
            if (typeof cmd === "string" && !cmd.startsWith('npm run build')) {
                throw new Error('buildCmd参数不符合规范，正确格式：npm run build:xxx');
            }
        }
        return cmd;
    }

    // 检测项目remote远程git仓库
    checkGitOrigin = async () => {
        const git = SimpleGit(process.cwd());
        const data = await git.getRemotes(true);
        if(Array.isArray(data) && data.length > 0 && data[0].refs){
            const originUrl = data[0].refs.fetch;
            if(originUrl.includes("github.com")){
                const path = originUrl.split(":")[1];
                this.gitPath = url.resolve(BASE_GITHUB_URL, path);
            } else if(originUrl.includes("gitee.com")){
                const path = originUrl.split(":")[1];
                this.gitPath = url.resolve(BASE_GITEE_URL, path);
            } else {
              this.gitPath = originUrl;  
            }
            log.verbose("git url", this.gitPath)
        } else {
            throw new Error("当前项目尚未发布到git或者git信息存在问题，无法继续发布，请检查当前项目的git信息");
        }
        this.git = git;
    }

    // 检测当前所在的git分支
    checkGitBranch = async () => {
        if(!this.git){
            this.git = SimpleGit(process.cwd());
        }
        const branch = await this.git.branch();
        this.branch = branch.current || DEFAULT_PULL_BRANCH;
    }

    // 检查项目信息
    checkProjectInfo = async () => {
        const pkgPath = path.resolve(process.cwd(), "./package.json");
        if(fs.existsSync(pkgPath)){
            const pkg = fse.readJsonSync(pkgPath);
            this.projectName = pkg.name;
            log.verbose("projectName: ", this.projectName)
        } else {
            throw new Error("当前项目下不存在package.json目录");
        }
    }

    // 检查服务监听端口是否被占用
    checkExposePort = async () => {
        const { username, password, host } = this.sshOptions;
        this.ssh = await Connect({ host, username, password });
        // 检测exposePort是否被占用
        let { exposePort } = this.sshOptions;
        let portRes;
        do {
            portRes = await execCommand(this.ssh, `netstat -anp |grep ${exposePort}`, false);
            console.log(portRes)
            exposePort++;
        } while(portRes != "")
        if(this.sshOptions.exposePort + 1 != exposePort){
            // 减1的原因是在最后一次while循环检测的时候多加了一次
            log.warn(`检测到远程服务器${this.sshOptions.exposePort}端口已被占用,将自动为你切换到${exposePort - 1}端口`);
            this.sshOptions.exposePort = exposePort - 1;
        }
    }

    // 生成服务器运行配置配置文件
    handleConfigFile = async () => {
        const { nginxPath, dockerFilePath } = this.sshOptions;
        const renderOptions = {
            workPath: WORK_PATH,
            projectName: this.projectName,
            exposePort: this.sshOptions.exposePort,
            gitPath: this.gitPath,
            serverName: this.sshOptions.serverName || this.sshOptions.host,
            cachePath: `/${this.sshOptions.username}/${SERVER_CACHE}`,
            buildOutPath: this.sshOptions.buildOutPath || DEFAULT_BUILD_OUT_PATH,
            buildCommand: this.sshOptions.buildCommand || DEFAULT_BUILD_CMD,
            branch: this.branch,
            forceClean: this.sshOptions.forceClean,
            containerSec: this.branch.includes("dev") ? "dev" : "master"
        };
        let shellFilePath;
        if(OS_OPTIONS.map(item => item.value).includes(this.sshOptions.os)){
            shellFilePath = path.resolve(__dirname, `${this.sshOptions.os}-create.sh`);
        }else{
            throw new Error("目前自动部署仅支持CentOS和Ubuntu系统");
        }
        const _nginxPath = nginxPath ? path.resolve(process.cwd(), nginxPath) : path.resolve(__dirname, "nginx.conf");
        const _dockerFilePath = dockerFilePath ? path.resolve(process.cwd(), dockerFilePath) : path.resolve(__dirname, "Dockerfile");
        const promises = [];
        const cacheDir = path.resolve(userHome, DEFAULT_CACHE_DIR);
        fse.ensureDirSync(cacheDir);
        [{ path: shellFilePath, name: "shell.sh" }, { path: _dockerFilePath, name: "Dockerfile" }, { path: _nginxPath, name: "nginx.conf" }].forEach(item => {
            if(fs.existsSync(item.path)){
                promises.push(new Promise((resolve, reject) => {
                    ejs.renderFile(item.path, renderOptions, {}, (err, result) => {
                        if(err){
                            reject(err);
                        } else {
                            const targetPath = path.resolve(cacheDir, item.name);
                            log.verbose(`生成${item.name}配置文件到 => `, targetPath);
                            fse.writeFileSync(targetPath, result);
                            resolve(result);
                        }
                    })
                }))
            }
        });
        return Promise.all(promises);
    }

    // 命令执行阶段
    exec = async () => {
        try {
            log.notice("=================开始同步远程服务器完成项目自动构建=================");
            if(!this.ssh){
                const { username, password, host } = this.sshOptions;
                this.ssh = await Connect({ host, username, password });
            }
            await this.execInitCheck(this.ssh);
            log.info("开始拷贝配置文件到服务器");
            await this.syncConfigFileToServer();
            log.success("配置文件拷贝成功");
            log.info("开始自定构建流程");
            await this.buildProject(this.ssh);
            log.success("执行自动化构建成功!!");
        }catch(err){
            log.error(err.messag ? err.message : err);
            if(this._argv.debug){
                log.error(e.stack);
            }
        }finally{
            process.exit(0);
        }
    }

    // 构建前服务器基本内容准备
    execInitCheck = async (ssh) => {
        await execCommand(ssh, `mkdir -p /${this.sshOptions.username}/${SERVER_CACHE}/`);
    }

    syncConfigFileToServer = async() => {
        const publishCacheDir = path.resolve(userHome, DEFAULT_CACHE_DIR);
        const configFiles = fs.readdirSync(publishCacheDir);
        const localPathArray = [];
        configFiles.forEach(filename => {
            const currentPath = path.resolve(publishCacheDir, filename);
            localPathArray.push({
                path: currentPath,
                name: filename
            });
        });
        const promises = localPathArray.map(item => {
            return uploadFileToServer(this.ssh, { localPath: item.path, remotePath: `/${this.sshOptions.username}/${SERVER_CACHE}/${item.name}` });
        });
        return Promise.all(promises);
    }
    
    // 设置shell脚本的可执行权限
    buildProject = async (ssh) => {
        await execCommand(ssh, `chmod 755 /${this.sshOptions.username}/${SERVER_CACHE}/shell.sh`);
        await execCommand(ssh, `sh /${this.sshOptions.username}/${SERVER_CACHE}/shell.sh`);
    }
}

function publish(args){
    return new PublishCommand(args)
}

module.exports = publish;