module.exports = function(){
    // return request({
    //     url: "/project/template"
    // })
    return [
        {
          name: 'vue2标准模版库',
          npmName: 'voyage-cli-vue2',
          version: '1.0.0',
          type: 'normal',
          installCommand: 'npm install',
          startCommand: 'npm run serve',
          tag: [ 'project' ],
          ignore: [ '**/public/**' ]
        },
        {
            name: 'vue3标准模版库',
            npmName: 'voyage-cli-vue3',
            version: '1.0.0',
            type: 'normal',
            installCommand: 'npm install',
            startCommand: 'npm run serve',
            tag: [ 'project' ],
            ignore: [ '**/public/**' ]
        },
        {
          name: 'voyage组件库模版',
          npmName: 'voyage-cli-components',
          version: '1.0.0',
          type: 'normal',
          installCommand: 'npm install --registry=https://registry.npm.taobao.org',
          startCommand: 'npm run serve',
          tag: [ 'component' ],
          ignore: [ '**/public/**' ]
        },
        {
          name: 'react标准模版库',
          npmName: 'voyage-cli-react',
          version: '1.0.0',
          type: 'normal',
          installCommand: 'npm install',
          startCommand: 'npm run dev',
          tag: [ 'project' ],
          ignore: [ '**/public/**' ]
        }
      ]
}