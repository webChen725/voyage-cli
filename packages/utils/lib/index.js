'use strict';
const spinnerStart = require("./spinner");
const log = require("./log");
const npm = require("./get-npm-info");
const Package = require("./Package");
const Command = require("./Command");
const Git = require("./Git");
const ssh = require("./ssh");

function isObject(o) {
    return Object.prototype.toString.call(o) === "[object Object]";
}

function sleep(timeout = 1000){
    return new Promise(resolve => setTimeout(resolve, timeout));
}

/**
 * 做windows和macOs的兼容
 */
 function exec(command, args, options){
    const win32 = process.platform === "win32";
    const cmd = win32 ? 'cmd' : command;
    const cmdArgs = win32 ? ['/c'].concat(command, args) : args;
    return require("child_process").spawn(cmd, cmdArgs, options || {});
}


function execAsync(command, args, options){
    return new Promise((resolve, reject) => {
        const p = exec(command, args, options);
        p.on("error", e => {
            reject(e);
        })
        p.on("exit", c => {
            resolve(c);
        })
    })
}

module.exports = {
    isObject,
    spinnerStart,
    sleep,
    exec,
    execAsync,
    log,
    npm,
    Package,
    Command,
    Git,
    ssh
}
