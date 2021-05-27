'use strict';
const SimpleGit = require("simple-git");
const userHome = require("user-home");
const fse = require("fs-extra");
const semver = require("semver");
const inquirer = require('./inquirer');
const path = require("path");
const fs = require("fs");
const log = require("../log");
const { readFile, writeFile } = require("../file");
const spinnerStart = require("../spinner");
const Github = require("./Github");
const Gitee = require("./Gitee")
const terminalLink = require("./terminalLink");
const { DEFAULT_CLI_HOME, GIT_ROOT_DIR, GIT_SERVER_FILE, GIT_TOKEN_FILE, GIT_OWN_FILE, GIT_IGNORE_FILE, COMPONENT_FILE,
  GIT_LOGIN_FILE, REPO_OWNER_USER, GITHUB, GITEE, GIT_SERVER_TYPE, GIT_OWNER_TYPE, GIT_OWNER_TYPE_ONLY, VERSION_RELEASE,
  COMPONENT_IGNORE, PROJECT_IGNORE, VERSION_DEVELOP} = require("./constants");

function createGitServer(gitServer){
  if(gitServer === GITHUB){
    return new Github();
  } else if(gitServer === GITEE){
    return new Gitee();
  }
  return null;
}

class Git {
    /**
     * 构造函数
     *
     * @param dir git 仓库本地目录
     * @param name git 仓库名称
     * @param version git 分支号
     * @param cliHome 缓存根目录
     * @param refreshToken 是否强制刷新token数据
     * @param refreshOwner 是否强制刷新own数据
     * @param refreshServer 是否强制刷新git远程仓库类型
     * @param prod 是否为正式发布，正式发布后会建立tag删除开发分支
     */
    constructor({ dir, name, version }, {
        cliHome, refreshToken, refreshOwner, refreshServer, 
        prod
      }){
        this.git = SimpleGit(dir);
        this.name = name;
        this.version = version;
        this.dir = dir; // 仓库本地路径
        this.owner = REPO_OWNER_USER; // owner 信息
        this.login = null; // 当前登录用户信息
        this.repo = null; // git 仓库
        this.homePath = cliHome; // 用户缓存主目录
        this.refreshToken = refreshToken; // 强制刷新 token
        this.refreshOwner = refreshOwner; // 强制刷新 owner
        this.refreshServer = refreshServer; // 强制刷新 git 远程仓库类型
        this.gitServer = null; // 默认远程 git 服务
        this.prod = prod; // 是否为正式发布
    }

    // 1. git初始化准备
    prepare = async() => {
      this.checkHomePath();
      await this.checkGitServer();
      await this.checkGitToken();
      await this.checkUserAndOrgs();
      await this.checkGitOwner();
      await this.checkRepo();
      await this.checkGitIgnore();
      await this.checkComponent();
      await this.init();
    }

    // 检查缓存主目录
    checkHomePath = () => {
      if(!this.homePath){
        if(process.env.CLI_HOME){
          this.homePath = path.resolve(userHome, process.env.CLI_HOME);
        } else {
          this.homePath = path.resolve(userHome, DEFAULT_CLI_HOME);
        }
      }
      log.verbose("home", this.homePath);
      fse.ensureDirSync(this.homePath);
      if(!fs.existsSync(this.homePath)){
        throw new Error("用户主目录获取失败");
      }
    }

    // 创建缓存目录
    createPath = (file) => {
      const rootDir = path.resolve(this.homePath, `${GIT_ROOT_DIR}-${this.name}`);
      const filePath = path.resolve(rootDir, file);
      fse.ensureDirSync(rootDir);
      return filePath;
    }

    // 选择远程git平台
    checkGitServer = async () => {
      const gitServerPath = this.createPath(GIT_SERVER_FILE);
      let gitServer = readFile(gitServerPath);
      if(!gitServer || this.refreshServer) {
        gitServer = await inquirer({
          type: 'list',
          choices: GIT_SERVER_TYPE,
          message: "请选择您需要托管的Git平台"
        });
        writeFile(gitServerPath, gitServer)
        log.success("git server写入成功: ", `${gitServer} ==> ${gitServerPath}`);
      } else {
        log.success("git server获取成功: ", gitServer);
      }
      this.gitServer = createGitServer(gitServer);
    }

    // 检查git api所必须的token
    checkGitToken = async () => {
      const tokenPath = this.createPath(GIT_TOKEN_FILE);
      let token = readFile(tokenPath);
      if(!token || this.refreshToken) {
        log.notice(this.gitServer.type + " token未生成", "请先生成 " + this.gitServer.type + " token, " + terminalLink("链接", this.gitServer.getTokenHelpUrl()));
        token = await inquirer({
          type: "password",
          message: "请将token复制到此处",
          defaultValue: ""
        });
        writeFile(tokenPath, token);
        log.success("token 写入成功", `${token} ==> ${tokenPath}`);
      } else {
        log.verbose('token', token);
        log.success("token获取成功", tokenPath);
      }
      this.token = token;
      this.gitServer.setToken(token);
    }

    // 检查用户和组织信息
    checkUserAndOrgs = async () => {
      this.user = await this.gitServer.getUser();
      this.orgs = await this.gitServer.getOrgs();
      if(!this.user){
        throw new Error("用户或组织信息获取失败");
      }
      log.success(this.gitServer.type + " 用户和组织信息获取成功");
    }

    // 检查 git owner是否选择
    checkGitOwner = async () => {
      const ownerPath = this.createPath(GIT_OWN_FILE);
      const loginPath = this.createPath(GIT_LOGIN_FILE);
      let owner = readFile(ownerPath);
      let login = readFile(loginPath);
      if(!owner || !login || this.refreshOwner){
        log.notice(this.gitServer.type + " owner 未生成, 先选择 owner");
        owner = await inquirer({
          type: "list",
          choices: this.orgs.length > 0 ? GIT_OWNER_TYPE : GIT_OWNER_TYPE_ONLY,
          message: "请选择远程仓库类型"
        });
        if(owner === REPO_OWNER_USER){
          login = this.user.login;
        } else {
          login = await inquirer({
            type: "list",
            choices: this.orgs.map(item => ({
              name: item.login,
              value: item.login
            })),
            message: "请选择"
          })
        }
        writeFile(ownerPath, owner);
        writeFile(loginPath, login);
        log.success("git owner写入成功", `${owner} ==> ${ownerPath}`);
        log.success("git login写入成功", `${login} ==> ${loginPath}`);
      } else {
        log.success('git owner 获取成功', owner);
        log.success("git login 获取成功", login);
      }
      this.owner = owner;
      this.login = login;
    }

    // 检查远程仓库
    checkRepo = async () => {
      let repo = await this.gitServer.getRepo(this.login, this.name);
      if(!repo){
        let spinner = spinnerStart("开始创建远程仓库....");
        try {
          if(this.owner === REPO_OWNER_USER){
            repo = await this.gitServer.createRepo(this.name);
          } else {
            repo = await this.gitServer.createOrgRepo(this.name, this.login);
          }
        }finally{
          spinner.stop();
        }
        if(repo) {
          log.success("远程仓库创建成功");
        } else {
          throw new Error("远程仓库创建失败");
        }
      }
      log.success("远程仓库信息获取成功");
      this.repo = repo;
    }

    // 检查 .gitignore
    checkGitIgnore = async () => {
      const gitIgnore = path.resolve(this.dir, GIT_IGNORE_FILE);
      if(!fs.existsSync(gitIgnore)){
        if(this.isComponent()) {
          writeFile(gitIgnore, COMPONENT_IGNORE);
          log.success("自动写入 .gitignore 文件");
        } else {
          writeFile(gitIgnore, PROJECT_IGNORE);
          log.success("自动写入 .gitignore 文件");
        }
      }
    }

    // 检查component
    checkComponent = async () => {
      let componentFile = this.isComponent();
      // 只有 component 才会启动该逻辑
      if(componentFile) {
        log.notice("开始检查 build 结果");
        require("child_process").execSync('npm run build', {
          cwd: this.dir,
        });
        // .componentrc配置文件中指定的buildPath构建输出目录
        const buildPath = path.resolve(this.dir, componentFile.buildPath);
        if(!fs.existsSync(buildPath)){
          throw new Error(`构建结果: ${buildPath} 不存在!`);
        }
        const pkg = this.getPackageJson();
        if(!pkg.files || !pkg.files.includes(componentFile.buildPath)) {
          throw new Error(`package.json 中files 属性未添加构建结果目录:[${componentFile.buildPath}], 请在 package.json 中手动添加!`);
        }
        log.verbose("build 结果检查通过");
      }
    }

    // 开始进行初始化
    init = async () => {
      if(await this.getRemote()){
        return true;
      }
      await this.initAndAddRemote();
      await this.initCommit();
    }

    // 获取remote信息: 关联的远程git仓库
    getRemote = async () => {
      const gitPath = path.resolve(this.dir, GIT_ROOT_DIR);
      this.remote = this.gitServer.getRemote(this.login, this.name);
      if(fs.existsSync(gitPath)){
        log.success("git 已初始化完成");
        return true;
      }
    }
    
    // 执行remote 初始化
    initAndAddRemote = async () => {
      log.notice("执行 git 初始化");
      await this.git.init(this.dir);
      log.notice("添加 git remote");
      const remotes = await this.git.getRemotes();
      log.verbose("git remotes", remotes);
      log.success(this.remote);
      if(!remotes.find(item => item.name === "origin")) {
        await this.git.addRemote('origin', this.remote);
      }
    }

    // 初始化commit
    initCommit = async () => {
      await this.checkConflicted();
      await this.checkNotCommitted();
      if(await this.checkRemoteMaster()){
        log.notice("远程存在 master 分支, 强制合并");
        await this.pullRemoteRepo('master', { '--allow-unrelated-histories': null });
      } else {
        await this.pushRemoteRepo("master");
      }
    }

    // 检查master分支
    checkRemoteMaster = async () => {
      return (await this.git.listRemote([ '--refs' ])).indexOf('refs/heads/master') >= 0;
    }

    // 代码冲突检查
    checkConflicted = async () => {
      log.notice("代码冲突检查");
      const status = await this.git.status();
      if(status.conflicted.length > 0){
        throw new Error('当前代码存在冲突，请手动处理后重试!');
      }
      log.success("代码检查通过");
    }

    // 检查是否本地commit
    checkNotCommitted = async () => {
      const status = await this.git.status();
      if(status.not_added.length > 0 || status.created.length > 0 || 
        status.deleted.length > 0 || status.modified.length > 0 || 
        status.renamed.length > 0){
        log.verbose("status", status);
        await this.git.add(status.not_added);
        await this.git.add(status.created);
        await this.git.add(status.deleted);
        await this.git.add(status.modified);
        await this.git.add(status.renamed);
        let message;
        while(!message){
          message = await inquirer({
            type: 'text',
            message: "请输入 commit 信息",
            defaultValue: ''
          })
        };
        await this.git.commit(message);
        log.success("本地 commit 提交成功");
      }
    }

    // git pull 远程分支
    pullRemoteRepo = async (branchName, options = {}) => {
      log.notice(`同步远程 ${branchName} 分支代码`);
      await this.git.pull('origin', branchName, options).catch(err => {
        if(err.message.indexOf('Permission denied (publickey)') >= 0){
          throw new Error(`请获取本地 ssh publickey 并配置到: ${this.gitServer.getSSHKeysUrl()}, 配置方法: ${this.gitServer.getSSHKeysHelpUrl()}`);
        } else if (err.message.indexOf('Couldn\'t find remote ref ' + branchName) >= 0) {
          log.notice('获取远程 [' + branchName + '] 分支失败');
        } else {
          log.error(err.message);
        }
        log.error("请重新执行 voyage-cli publish,如果仍然报错，请尝试删除 .git 目录后重试");
        process.exit(0);
      })
    }

    // git push 到git仓库
    pushRemoteRepo = async (branchName) => {
      log.notice(`推送代码至远程分支 ${branchName} 分支`);
      await this.git.push('origin', branchName);
      log.success("推送代码成功!");
    }

    // 2. git commit 代码
    commit = async () => {
      await this.getCorrectVersion();
      await this.checkStach();
      await this.checkConflicted();
      await this.checkNotCommitted();
      await this.checkoutBranch(this.branch);
      await this.pullRemoteMasterAndBranch();
      await this.pushRemoteRepo(this.branch);
      await this.checkRelease();
    }

    // 获取当前commit分支版本
    getCorrectVersion = async () => {
      log.notice("获取代码分支");
      const remoteBranchList = await this.getRemoteBranchList(VERSION_RELEASE);
      let releaseVersion = null;
      if(remoteBranchList && remoteBranchList.length > 0){
        // 获取最近的线上版本
        releaseVersion = remoteBranchList[0];
      };
      const devVersion = this.version;
      if(!releaseVersion) {
        this.branch = `${VERSION_DEVELOP}/${devVersion}`;
      } else if (semver.gt(this.version, releaseVersion)){
        log.info('当前版本大于线上最新版本', `${devVersion} >= ${releaseVersion}`);
        this.branch = `${VERSION_DEVELOP}/${devVersion}`;
      } else {
        log.notice("当前线上版本大于或等于本地版本", `${releaseVersion} >= ${devVersion}`);
        const incType = await inquirer({
          type: "list",
          choices: [{
            name: `小版本 (${releaseVersion} -> ${semver.inc(releaseVersion, 'patch')})`,
            value: 'patch'
          }, {
            name: `中版本 (${releaseVersion} -> ${semver.inc(releaseVersion, "minor")})`,
            value: "minor"
          }, {
            name: `大版本 (${releaseVersion} -> ${semver.inc(releaseVersion, "major")})`,
            value: 'major'
          }],
          defaultValue: 'patch',
          message: "自动版本升级, 请选择升级版本类型"
        });
        const incVersion = semver.inc(releaseVersion, incType);
        this.branch = `${VERSION_DEVELOP}/${incVersion}`;
        this.version = incVersion;
        this.syncVersionToPackageJson();
      }
      log.success(`代码分支获取成功 ${this.branch}`);
    }

    // 同步自动升级的版本号到package.json文件
    syncVersionToPackageJson = async () => {
      const pkg = fse.readJsonSync(`${this.dir}/package.json`);
      if(pkg && pkg.version !== this.version) {
        pkg.version = this.version;
        fse.writeJsonSync(`${this.dir}/package.json`, pkg, { spaces: 2 })
      }
    }

    // 获取远程分支列表
    getRemoteBranchList = async (type) => {
      // git ls-remote --refs
      const remoteList = await this.git.listRemote([ '--refs' ]);
      let reg;
      if(type === VERSION_RELEASE){
        reg = /.+?refs\/tags\/release\/(\d+\.\d+\.\d+)/g;
      } else {
        reg = /.+?refs\/heads\/dev\/(\d+\.\d+\.\d+)/g;
      }
      return remoteList.split('\n').map(remote => {
        const match = reg.exec(remote);
        reg.lastIndex = 0;
        if(match && semver.valid(match[1])) {
          return match[1];
        }
      }).filter(_ => _).sort((a, b) => {
        if(semver.lte(b, a)){
          if(a === b) return 0;
          return -1;
        }
        return 1;
      })
    }

    // 检查 stach 记录
    checkStach = async () => {
      log.notice("检查 stash 记录");
      const stashList = await this.git.stashList();
      if(stashList.all.length > 0){
        await this.git.stash([ 'pop' ]);
        log.success("stash pop 成功");
      }
    }

    // 切换分支
    checkoutBranch = async (branch) => {
      const localBranchList = await this.git.branchLocal();
      if(localBranchList.all.indexOf(branch) >= 0){
        await this.git.checkout(branch);
      } else {
        await this.git.checkoutLocalBranch(branch);
      }
      log.success(`分支切换到${branch}`);
    }

    // 合并远程master和当前分支
    pullRemoteMasterAndBranch = async () => {
      log.notice(`合并分支: [master] => [${this.branch}]`);
      await this.pullRemoteRepo('master');
      log.success('合并远程 [master] 分支内容成功');
      await this.checkConflicted();
      log.notice("检查远程分支");
      const remoteBranchList = await this.getRemoteBranchList();
      if(remoteBranchList.indexOf(this.version) >= 0){
        log.notice(`合并 [${this.branch}] => [${this.branch}]`);
        await this.pullRemoteRepo(this.branch);
        log.success(`合并远程 [${this.branch}] 分支内容成功`);
        await this.checkConflicted();
      } else {
        log.success(`不存在远程分支 [${this.branch}]`);
      }
    }

    // 判断是否为组件
    isComponent = () => {
      const componentFilePath = path.resolve(this.dir, COMPONENT_FILE);
      return fs.existsSync(componentFilePath) && fse.readJsonSync(componentFilePath);
    }

    // 获取项目 package.json文件
    getPackageJson = () => {
      const pkgPath = path.resolve(this.dir, "package.json");
      if(!fs.existsSync(pkgPath)){
        throw new Error("package.json 不存在!");
      }
      return fse.readJsonSync(pkgPath);
    }

    // 检测是否发布版本
    checkRelease = async () => {
      if(this.prod){
        await this.uploadComponentToNpm();
        await this.checkTag(); // 打tag
        await this.checkoutBranch("master"); // 切换分支到master
        await this.mergeBranchToMaster();  // 将当前分支代码合并到master
        await this.pushRemoteRepo("master");  // 将代码推送到远程master
        await this.deleteLocalBranch();  // 删除本地分支
        await this.deleteRemoteBranch();
      }
    }

    // 发布组件到npm
    uploadComponentToNpm = async () => {
      if(this.isComponent()){
        log.notice("开始发布组件到Npm");
        require("child_process").execSync('npm publish', {
          cwd: this.dir
        })
        log.notice("npm 发布成功");
      }
    }

    // git打tag标记
    checkTag = async() => {
      log.notice("获取远程git仓库 tag 列表");
      const tag = `${VERSION_RELEASE}/${this.version}`;
      const tagList = await this.getRemoteBranchList(VERSION_RELEASE);
      if(tagList.includes(this.version)){
        log.success("远程 tag 已存在", tag);
        await this.git.push([ 'origin', `:refs/tags/${tag}` ]);
        log.success("远程 tag 已删除", tag);
      }
      const localTagList = await this.git.tags();
      if(localTagList.all.includes(tag)){
        log.success("本地 tag 已存在", tag);
        await this.git.tag([ '-d', tag ]);
        log.success("本地 tag 已删除", tag);
      }
      await this.git.addTag(tag);
      log.success("本地 tag 创建成功", tag);
      await this.git.pushTags('origin');
      log.success("远程 tag 推送成功", tag);
    }

    // 从当前分支合并到master
    mergeBranchToMaster = async () => {
      log.notice("开始合并代码", `[${this.branch} ==> [master]]`);
      await this.git.mergeFromTo(this.branch, 'master');
      log.success("代码合并成功", `[${this.branch} ==> [master]]`);
    }

    // 删除本地的当前分支
    deleteLocalBranch = async () => {
      log.notice("开始删除本地分支", this.branch);
      await this.git.deleteLocalBranch(this.branch);
      log.success("删除本地分支成功", this.branch);
    }

    // 删除远程的当前分支
    deleteRemoteBranch = async () => {
      log.notice("开始删除远程分支", this.branch);
      await this.git.push([ 'origin', '--delete', this.branch ]);
      log.success('删除远程分支成功', this.branch);
    }
}

module.exports = Git;


