const DEFAULT_CLI_HOME = '.voyage-cli';
const GIT_ROOT_DIR = ".git";
const GIT_SERVER_FILE = '.git_server';
const GIT_TOKEN_FILE = ".git_token";
const GIT_LOGIN_FILE = ".git_login";
const GIT_OWN_FILE = ".git_own";
const GIT_PUBLISH_FILE = ".git_publish";
const GIT_IGNORE_FILE = ".gitignore";
const REPO_OWNER_USER = "user";
const REPO_OWNER_ORG = "org";

const GITHUB = "github";
const GITEE = "gitee";

const VERSION_RELEASE = "release";
const VERSION_DEVELOP = "dev";
const COMPONENT_FILE = ".componentrc";

const TEMPLATE_TEMP_DIR = "oss";

const GIT_SERVER_TYPE = [{
    name: "Github",
    value: GITHUB
}, {
    name: "Gitee(码云)",
    value: GITEE
}];

const GIT_OWNER_TYPE = [{
    name: '个人',
    value: REPO_OWNER_USER
}, {
    name: '组织',
    value: REPO_OWNER_ORG
}];

const GIT_OWNER_TYPE_ONLY = [{
    name: "个人",
    value: REPO_OWNER_USER
}]

const GIT_PUBLISH_TYPE = [{
    name: "OSS",
    value: 'oss'
}]

const COMPONENT_IGNORE = `.DS_Store
node_modules
# local env files
.env.local
.env.*.local
# Log files
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
package-lock.json
# Editor directories and files
.idea
.vscode
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?`;

const PROJECT_IGNORE = `.DS_Store
node_modules
/dist
# local env files
.env.local
.env.*.local
# Log files
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
package-lock.json
# Editor directories and files
.idea
.vscode
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?`;

module.exports = {
    DEFAULT_CLI_HOME,
    GIT_ROOT_DIR,
    GIT_SERVER_FILE,
    GIT_TOKEN_FILE,
    GIT_LOGIN_FILE,
    GIT_OWN_FILE,
    GIT_PUBLISH_FILE,
    GIT_IGNORE_FILE,
    REPO_OWNER_USER,
    REPO_OWNER_ORG,

    GITHUB,
    GITEE,

    VERSION_RELEASE,
    VERSION_DEVELOP,
    COMPONENT_FILE,

    TEMPLATE_TEMP_DIR,

    GIT_SERVER_TYPE,

    GIT_OWNER_TYPE,

    GIT_OWNER_TYPE_ONLY,

    GIT_PUBLISH_TYPE,

    COMPONENT_IGNORE,
    PROJECT_IGNORE
}