'use strict';

module.exports = core;
const fs = require("fs");
const semver = require("semver");
const colors = require("colors");
const userHome = require("user-home");
const pathExists = require("path-exists").sync;
const commander = require("commander");
const path = require("path");
const { log, npm, Package, exec: spawn } = require("voyage-cli-utils");
const pkg = require("../package.json");
const DEFAULT_CLI_HOME = ".voyage-cli";
const DEPENDENCIES_PATH = "dependencies";
const { getNpmSemverVersion } = npm;

let config;
let args;
const program = new commander.Command();
async function core() {
    try {
        await prepare();
        registerCommand();
    }catch(err){
        log.error(err)
        if(program.debug){
            console.error(err)
        }
    }
}

/**
 * 检查当前版本号
 */
function checkPkgVersion(){
    log.notice("cli", pkg.version);
}

/**
 * 检查node版本
 */
// function checkNodeVersion(){
//     const currentVersion = process.version;
//     const lowestVersion = constants.LOWEST_NODE_VERSION;
//     if(!semver.gte(currentVersion, lowestVersion)){
//         throw new Error(colors.red(`voyage-cli 需要安装 v${lowestVersion} 以上版本的node.js`));
//     }
// }

/**
 * 检查当前是否是root用户操作: 避免出现高权限的文件等导致后期完成完成操作
 */
function checkRoot(){
    const rootCheck = require("root-check");
    rootCheck(colors.red("请避免使用root账户启动本应用."));  // 对root权限进行降级
}

/**
 * 检查用户主目录
 */
function checkUserHome(){
    if(!userHome || !pathExists(userHome)){
        throw new Error(colors.red("当前用户主目录不存在."))
    }
}

/**
 * 检查入参
 */
function checkInputArgs(){
    log.verbose("开始校验输入参数");
    const minimist = require("minimist");
    args = minimist(process.argv.slice(2));
    checkArgs(args)
}

/**
 * 是否debug模式启动
 */
function checkArgs(args){
    if(args.debug){
        process.env.LOG_LEVEL = "verbose";
    }else{
        process.env.LOG_LEVEL = "info";
    }
    log.level = process.env.LOG_LEVEL;
}

/**
 * 检查环境变量
 */
function checkEnv(){
    log.verbose("开始检查环境变量.")
    const dotenv = require("dotenv");
    const dotenvPath = path.resolve(userHome, ".env");
    if(pathExists(dotenvPath)){
        config = dotenv.config({
            path: dotenvPath
        })
    }
    config = createDefaultConfig();
}

/**
 * 创建默认环境变量
 */
function createDefaultConfig(){
    const cliConfig = {
        home: userHome
    };
    if(process.env.CLI_HOME){
        cliConfig["cliHome"] = path.join(userHome, process.env.CLI_HOME);
    }else{
        cliConfig["cliHome"] = path.join(userHome, DEFAULT_CLI_HOME);
    }
    process.env.CLI_HOME_PATH = cliConfig.cliHome;
    return cliConfig;
}

/**
 * 检查是否需要全局更新
 */
async function checkGlobalUpdate(){
    log.verbose("检查脚手架最新版本");
    const currentVersion = pkg.version;
    const npmName = pkg.name;
    const lastVersion = await getNpmSemverVersion(currentVersion, npmName);
    if(lastVersion && semver.gte(lastVersion, currentVersion)){
        log.warn(`请手动更新 ${npmName}, 当前版本：${currentVersion}, 最新版本：${lastVersion}。你可以通过: npm install -g ${npmName} 完成更新`)
    }
}

/**
 * 脚手架命令注册前的准备
 */
async function prepare(){
    checkPkgVersion();
    // checkNodeVersion();
    checkRoot();
    checkUserHome();
    checkInputArgs();
    checkEnv();
    // await checkGlobalUpdate();
}


/**
 * 注册脚手架命令
 */
function registerCommand(){
    program.name(Object.keys(pkg.bin)[0])
        .usage("<command> [options]")
        .version(pkg.version)
        .option("-d, --debug", "是否开启调试模式", false)
        .option("-tp, --targetPath <targetPath>", '是否指定本地调试文件', '');
    
    program.command("init [projectName]")
        .description('项目初始化')
        .option("-f, --force", "是否强制初始化项目")
        .action(async (projectName, { force }) => {
            const packageName = "voyage-cli-init";
            const packageVersion = "latest";
            const packagePath = process.env.CLI_TARGET_PATH;
            await exec({ packagePath, packageName, packageVersion }, { projectName, force }, { config, args })
        });

    program.command('commit')
        .description('项目提交到git')
        .option('--refreshToken', '强制更新git token信息')
        .option('--refreshOwner', '强制更新git owner信息')
        .option('--refreshServer', '强制更新git server信息')
        .option('--force', '强制更新所有缓存信息')
        .option('--prod', '正式发布')
        .action(async ({ refreshToken, refreshOwner, refreshServer, force, prod }) => {
            const packageName = 'voyage-cli-commit';
            const packageVersion = 'latest';
            const packagePath = process.env.CLI_TARGET_PATH;
            if (force) {
                refreshToken = true;
                refreshOwner = true;
                refreshServer = true;
            }
            await exec({ packagePath, packageName, packageVersion }, {
                refreshToken,
                refreshOwner,
                refreshServer,
                prod
            }, { config, args });
    });

    program.command("publish")
        .description("项目自动发布到云服务器")
        .action(async () => {
            const packageName = 'voyage-cli-publish';
            const packageVersion = 'latest';
            const packagePath = process.env.CLI_TARGET_PATH;
            await exec({packagePath, packageName, packageVersion}, {}, { config, args });
        })
        

    // 监听debug模式
    program.on("option:debug", function(){
        if(program.debug){
            process.env.LOG_LEVEL = "verbose"; 
        }else{
            process.env.LOG_LEVEL = "info";
        }
        log.level = process.env.LOG_LEVEL;
    })

    // 监听tagetPath
    program.on("option:targetPath",function(){
        process.env.CLI_TARGET_PATH = program.targetPath;
    })

    // 监听未知命令
    program.on("command:*", function(obj){
        const availableCommands = program.commands.map(cmd => cmd.name());
        console.log(colors.red('未知命令：', obj[0]))
        if(availableCommands.length > 0){
            console.log(colors.blue('可用命令：', availableCommands.join(",")))
        }
    })

    program.parse(process.argv);
    if(program.args && program.args.length < 1){
        program.outputHelp();
    }
}

async function exec({ packagePath, packageName, packageVersion }, extraOptions, baseOption) {
    let rootFile;
    const { config, args } = baseOption;
    try {
        if(packagePath){
            const execPackage = new Package({
                targetPath: packagePath,
                storeDir: packagePath,
                name: packageName,
                version: packageVersion
            });
            rootFile = execPackage.getRootFilePath();
        } else {
            const cliHome = config.cliHome || process.env.CLI_HOME_PATH;
            const packageDir = `${DEPENDENCIES_PATH}`;
            const targetPath = path.resolve(cliHome, packageDir);
            const storePath = path.resolve(targetPath, 'node_modules');
            const initPackage = new Package({
                targetPath,
                storeDir: storePath,
                name: packageName,
                version: packageVersion,
            });
            if (await initPackage.exists()) {
                await initPackage.update();
            } else {
                await initPackage.install();
            }
            rootFile = initPackage.getRootFilePath();
        }
        const _config = Object.assign({}, config, extraOptions, {
            debug: args.debug
        });
        if(fs.existsSync(rootFile)){
            const code = `require('${rootFile}').call(null, ${JSON.stringify(_config)})`;
            const child = spawn("node", ['-e', code], {
                cwd: process.cwd(),
                stdio: "inherit"  // 将stdio流传递给父进程或者从父进程传入
            });
            child.on("error", e => {
                log.error(e.message);
            })
            child.on("exit", e => {
                log.verbose("命令执行成功: " + e);
                process.exit(e);
            })
        } else {
            throw new Error("入口文件不存在，请指定明确的入口文件.")
        }
    }catch(err){
        log.error(err.message);
    }
}