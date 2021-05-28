'use strict';
const path = require("path");
const fs = require("fs");
const fse = require("fs-extra");
const colors = require("colors");
const { Command, log, Git } = require("voyage-cli-utils");

class PublishCommand extends Command {
    async init(){
        try {
            log.verbose("publish: ", this._argv);
            this.prepare(this._argv);
            const projectInfo = this.checkProjectInfo();
            const git = new Git(projectInfo, this._argv);
            log.info(colors.red("===="), colors.green("git配置检查"), colors.red("===="));
            await git.prepare();
            log.info(colors.red("===="), colors.green("git自动提交"), colors.red("===="));
            await git.commit();
            log.success("=====voyage-cli Git提交成功======")
            // log.info(colors.red("===="), colors.green("云构建 + 云发布"), colors.red("===="));
            // await git.publish();
        }catch(e){
            if(this._argv.debug){
                log.error('Error: ', e.stack);
            } else {
                log.error("Error: ", e.message);
            }
        }
    }
    exec(){}

    prepare(options){
        // 切换远程git服务器时删除当前目录下已存在的 .git目录
        if(options.refreshServer){
            log.notice("切换Git服务， 删除本地.git文件");
            const gitPath = path.resolve(process.cwd(), ".git");
            if(fs.existsSync(gitPath)){
                fse.emptyDirSync(gitPath)
            }
            log.success("本地.git文件清除成功");
        }
    }

    checkProjectInfo(){
        const projectPath = process.cwd();
        const pkgPath = path.resolve(projectPath, "package.json");
        log.verbose("pkgPath: ", pkgPath);
        if(!fs.existsSync(pkgPath)){
            throw new Error("package.json文件不存在");
        }
        const pkg = fse.readJSONSync(pkgPath);
        const { name, version } = pkg;
        log.verbose("project: ", name, version);
        return { name, version, dir: projectPath };
    }
}


function init(args) {
    return new PublishCommand(args);
}


module.exports = init;