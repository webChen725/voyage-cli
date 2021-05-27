'use strict';

const semver = require("semver");
const colors = require("colors");
const log = require("./log");
const LOWEST_NODE_VERSION = "12.0.0";  // 最低node版本
class Command {
    constructor(argv){
        this.checkArgv(argv);
        this._argv = argv;
        let runner = new Promise((resolve, reject) => {
            let chain = Promise.resolve();
            chain = chain.then(() => this.checkNodeVersion());
            // chain = chain.then(() => this.initArgs());
            chain = chain.then(() => this.init());
            chain = chain.then(() => this.exec());
            chain.catch(err => {
                log.error(err.message);
            })
        })
    }

    /**
     * 检查argv参数
     */
    checkArgv(argv){
        if(!argv){
            throw new Error("指令参数不能为空");
        }
        // if(!Array.isArray(argv)){
        //     throw new Error("参数必须为一个Array");
        // }
        // if(argv.length < 1){
        //     throw new Error("参数列表为空");
        // }
    }

    /**
     * 初始化参数
     */
    // initArgs(){
    //     // this._cmd = this._argv[this._argv.length - 1];
    //     // this._argv = this._argv.slice(0, this._argv.length - 1);
    //     this._options = this._argv;
    // }

    /**
     * 检查node版本
     */
    checkNodeVersion(){
        const currentVersion = process.version;
        const lowestVersion = LOWEST_NODE_VERSION;
        if(!semver.gte(currentVersion, lowestVersion)){
            throw new Error(colors.red(`voyage-cli 需要安装 v${lowestVersion} 以上版本的node.js`));
        }
    }

    /**
     * 命令初始化阶段
     */
    init(){
        // 将命令初始化操作下沉到子类中实现，类似一个抽象方法
        throw new Error("init方法是必须实现的");
    }

    /**
     * 命令执行阶段
     */
    exec(){
        // 将命令的执行操作下沉到子类中实现，类似一个抽象方法
        throw new Error("exec方法是必须实现的");
    }
}



module.exports = Command;

