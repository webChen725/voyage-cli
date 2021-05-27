'use strict';
const { NodeSSH } = require("node-ssh");
const log = require("./log");

// 创建ssh连接
function Connect({ username, password, host }){
    const ssh = new NodeSSH();
    return new Promise((resolve, reject) => {
        ssh.connect({
            host,
            username,
            password
        }).then(() => {
            log.success("远程连接就绪")
            resolve(ssh);
        }).catch(err => {
            log.error("远程连接服务器失败");
            reject();
        })
    });
}
// 同步文件到远程服务器
function uploadFileToServer(ssh, {localPath, remotePath}) {
    return new Promise((resolve, reject) => {
        ssh.putFile(localPath, remotePath).then(status => {
            log.success(`远程同步文件${localPath}成功`);
            resolve(status)
        }).catch(err => {
            log.error("远程同步文件失败");
            reject(err);
        })
    })
}

// 执行远程服务器shell指令 cwd: "~/",
function execCommand(ssh, command, showInfo = true){
    return new Promise((resolve, reject) => {
        ssh.execCommand(command, { onStdout: (chunk) => {
            showInfo && log.info(chunk.toString())
        } }).then((result) => {
            if (!result.stderr){
                log.success(`${command}指令执行成功!`);
                resolve(result.stdout)
            }else{
                log.error("远程服务器执行构建脚本发生错误", result.stderr);
                reject(result.stderr) 
            }
        })
    })
}

function closeConn(ssh){
    if(conn){
        log.info("断开远程连接");
        ssh.dispose();
    }
}


module.exports = {
    Connect,
    uploadFileToServer,
    execCommand,
    closeConn
};