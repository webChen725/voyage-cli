#! /bin/bash
echo "开始尝试自动构建"
WORK_PATH="<%= workPath %>"
PROJECT_NAME="<%= projectName %>"
PORT="<%= exposePort %>"
GIT_PATH="<%= gitPath %>"
CACHE_PATH="<%= cachePath %>"
BRANCH="<%= branch %>"
FORCE_CLEAN="<%= forceClean %>"
CONTAINER_SEC="<%= containerSec %>"
command -v yum >/dev/null 2>&1 || {
  echo "自动构建将使用 yum 命令安装相应依赖，检测到当前服务器不存在该命令."
  exit 0
}
echo "创建用户指定项目目录"
if [ ! -d "$WORK_PATH" ]; then
  mkdir -p $WORK_PATH
fi
cd $WORK_PATH
echo "安装git并拉取远程项目到本地"
command -v git >/dev/null 2>&1 || {
  echo >&2 "开始安装git"
  yum install git
}
if [ $FORCE_CLEAN = "true" ] && [ -d "$WORK_PATH/$PROJECT_NAME" ]; then
  echo "强制删除当前目录"
  rm -rf $WORK_PATH/$PROJECT_NAME
fi
if [ ! -d "$WORK_PATH/$PROJECT_NAME" ]; then
  echo "初始化部署，开始clone远程git仓库"
  git clone $GIT_PATH
  if [ ! -d "$WORK_PATH/$PROJECT_NAME" ]; then
    echo "clone远程仓库失败"
    exit 0
  fi
else
  echo "仓库已存在，git pull远程 $BRANCH 代码到当前仓库"
  cd $WORK_PATH/$PROJECT_NAME
  git pull origin $BRANCH
fi
command -v node >/dev/null 2>&1 || {
  echo "开始安装node环境"
  cd ~/
  git clone https://github.com/creationix/nvm.git
  source nvm/nvm.sh
  command -v nvm >/dev/null 2>&1 || {
      echo "nvm安装失败，程序退出."
      exit 0
  }
  nvm install stable
  command -v node >/dev/null 2>&1 || {
      echo "安装node环境失败"
      exit 0
  }
}
command -v nrm >/dev/null 2>&1 || {
  echo "安装nrm进行node源切换"
  npm install nrm -g
  command -v nrm >/dev/null 2>&1 || {
      echo "nrm源切换失败,此次部署安装可能需要较多时间"
  }
}
nrm use taobao
command -v docker >/dev/null 2>&1 || {
  echo "开始安装并配置docker"
  yum install -y yum-utils device-mapper-persistent-data lvm2
  yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
  yum install -y docker-ce docker-ce-cli containerd.io
  command -v docker >/dev/null 2>&1 || {
      echo "安装docker失败"
      exit 0
  }
  echo "配置docker为阿里镜像源加速"
  mkdir -p /etc/docker
  tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": ["https://fwvjnv59.mirror.aliyuncs.com"]
}
EOF
  systemctl daemon-reload
  systemctl restart docker
}
cd $WORK_PATH/$PROJECT_NAME
echo "打包构建项目"
npm install
<%= buildCommand %>
echo "复制Dockerfile文件和nginx.conf配置文件到当前目录"
cp $CACHE_PATH/Dockerfile .
cp $CACHE_PATH/nginx.conf .
echo "=========开始执行docker构建=============="
docker build -t $PROJECT_NAME-$CONTAINER_SEC:1.0 .
cp ~/.voyage-cli/nginx.conf /etc/nginx/conf.d
echo "停止旧容器并删除"
docker stop $PROJECT_NAME-$CONTAINER_SEC-container
docker rm $PROJECT_NAME-$CONTAINER_SEC-container
echo "启动新的docker容器 $PROJECT_NAME-$CONTAINER_SEC-container"
docker container run -p $PORT:$PORT --name $PROJECT_NAME-$CONTAINER_SEC-container -d $PROJECT_NAME-$CONTAINER_SEC:1.0