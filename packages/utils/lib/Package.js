const path = require("path");
const fse = require("fs-extra");
const pkgDir = require("pkg-dir").sync;
const npminstall = require("npminstall");
const pathExists = require("path-exists").sync;
const { getNpmLatestVersion, getDefaultRegistry } = require("./get-npm-info");
const formatPath = require("./formatPath");

function isObject(o) {
    return Object.prototype.toString.call(o) === "[object Object]";
}

class Package {
    constructor(options){
        if(!options){
            throw new Error("Package类的options参数不能为空");
        }
        if(!isObject(options)){
            throw new Error("Package类的options参数必须为对象");
        }
        // package的目标路径
        this.targetPath = options.targetPath;
        // 缓存package的路径
        this.storeDir = options.storeDir;
        // packege的name
        this.packageName = options.name;
        // package的version
        this.packageVersion = options.version;
        // package的缓存前缀
        this.cacheFilePathPrefix = this.packageName.replace("/", "_")
    }

    async prepare(){
        if(this.storeDir && !pathExists(this.storeDir)){
            // 创建storeDir下所有需要的目录
            fse.mkdirpSync(this.storeDir);
        }
        if(this.packageVersion === "latest"){
            this.packageVersion = await getNpmLatestVersion(this.packageName);
        }
    }

    /**
     * 获取文件的缓存路径
     */
    get cacheFilePath(){
        return path.resolve(this.storeDir, `_${this.cacheFilePathPrefix}@${this.packageVersion}@${this.packageName}`);
    }

    // 生成指定版本号模块对应的缓存路径
    getSpecificCacheFilePath(packageVersion){
        return path.resolve(this.storeDir, `_${this.cacheFilePathPrefix}@${packageVersion}@${this.packageName}`);
    }

    /**
     * 判断package是否存在
     */
    async exists(){
        if(this.storeDir){
            await this.prepare();
            return pathExists(this.cacheFilePath);
        } else {
            return pathExists(this.targetPath);
        }
    }

    /**
     * 安装package
     */
    async install(){
        await this.prepare();
        console.log("安装")
        return npminstall({
            root: this.targetPath,
            storeDir: this.storeDir,
            registry: getDefaultRegistry(),
            pkgs: [
                { name: this.packageName, version: this.packageVersion }
            ]
        })
    }

    /**
     * 更新package
     */
    async update(){
        await this.prepare();
        // 1. 获取最新的npm模块的版本号
        const latestPackageVersion = await getNpmLatestVersion(this.packageName);
        // 2. 查询最新版本号对应的路径是否存在
        const latestFilePath = this.getSpecificCacheFilePath(latestPackageVersion);
        // 3. 如果不存在，则直接安装最新的版本号
        if(!pathExists(latestFilePath)){
            await npminstall({
                root: this.targetPath,
                storeDir: this.storeDir,
                registry: getDefaultRegistry(),
                pkgs: [
                    { name: this.packageName, version: latestPackageVersion }
                ]
            })
            this.packageVersion = latestPackageVersion;
        } else {
            this.packageVersion = latestPackageVersion;
        }
    }

    /**
     * 获取入口文件的路径
     */
    getRootFilePath(){
        function _getRootFile(targetPath){
            // 1. 获取package.json文件
            const dir = pkgDir(targetPath);
            if(dir){
                // 2. 读取package.json -> require()
                const pkgFile = require(path.resolve(dir, "package.json"));
                // 3. main/lib -> path
                if(pkgFile && pkgFile.main){
                    // 4. 路径兼容(macOS/Windows)
                    return formatPath(path.resolve(dir, pkgFile.main));
                }
            }
            return null;
        }
        if(this.storeDir){
            return _getRootFile(this.cacheFilePath)
        }else{
           return _getRootFile(this.targetPath)
        }
    }
}


module.exports = Package;