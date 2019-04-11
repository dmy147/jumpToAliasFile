import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from "fs";
import WebpackAliasSearcher from './WebpackAliasSearcher';
import { extensions,template } from "./util";
// import * as fsExtra from 'fs-extra';
export default class Configuration {
  private _workspaceDir: string;
  private _configuration: vscode.WorkspaceConfiguration;
  private _listenConfigChangeDispose: { dispose(): any };
  private _webpackAliasSearcher: WebpackAliasSearcher;
  constructor() {
    this._workspaceDir = vscode.workspace.rootPath;
    this._syncConfiguration();
    this._listenConfigChange();
    if (!Object.keys(this.alias).length) {
      // 不存在 alias 时, 走自动寻找 alias 策略
      this._webpackAliasSearcher = new WebpackAliasSearcher(this._workspaceDir);
      let alias = this._webpackAliasSearcher.getDefaultAlias();
      this.alias = { ...this.alias, ...alias };
    }
  }

  private _syncConfiguration() {
    let oldWebpeckConfigPath: string;
    if (this._configuration) {
      oldWebpeckConfigPath = this._configuration.get('webpeckConfigPath');
    }
    this._configuration = vscode.workspace.getConfiguration('aliasFork', vscode.Uri.file(this._workspaceDir));
    let newWebpeckConfigPath: string = this._configuration.get('webpeckConfigPath');
    if (newWebpeckConfigPath && newWebpeckConfigPath !== oldWebpeckConfigPath) {
      // webpeckConfigPath 发生了变化, 读取 webpackConfig 文件中的 alias, 设置到 alias 中
      this._syncWebpeckConfigAlias(newWebpeckConfigPath);
    }
  }
  private _listenConfigChange() {
    this._listenConfigChangeDispose = vscode.workspace.onDidChangeConfiguration(this._syncConfiguration.bind(this));
  }
  private _syncWebpeckConfigAlias(webpeckConfigPath: string) {
    let webpackConfig: any;
    try {
      webpackConfig = require(path.join(this._workspaceDir, webpeckConfigPath));
    } catch (error) {

    }
    if (webpackConfig && webpackConfig.resolve && webpackConfig.resolve.alias && typeof webpackConfig.resolve.alias === 'object') {
      this.alias = { ...this.alias, ...webpackConfig.resolve.alias };
    }
  }
  get alias() {
    return this._configuration.get('alias') || {};
  }
  set alias(alias) {
    if (alias && Object.keys(alias).length) {
      const newAlias = Object.keys(alias).reduce((pre,now)=>{
        pre[now] = path.relative(this._workspaceDir,alias[now])
        return pre
      },{})
      this._configuration.update('alias', newAlias);
      this.buildConfig(newAlias)
    }
  }
  dispose() {
    this._listenConfigChangeDispose.dispose();
  }
  buildConfig(alias=this.alias){
    let configPath = '';
    let tsconfigPath = path.resolve(this._workspaceDir,"tsconfig.json")
    let jsconfigPath = path.resolve(this._workspaceDir,"jsconfig.json")
    if(fs.existsSync(tsconfigPath)){
      configPath = tsconfigPath
    }else if(fs.existsSync(jsconfigPath)){
      configPath = jsconfigPath
    }
    let tsconfig
    let replacePath = path.resolve(this._workspaceDir,template.compilerOptions.baseUrl)
    if(!configPath){
      configPath=jsconfigPath
      tsconfig=template
      // fsExtra.ensureFileSync(configPath)
    }else{
      try {
     tsconfig = require(configPath)
        
      } catch (error) { 
        tsconfig=template
      }
    }
    if(!tsconfig.hasOwnProperty("compilerOptions")){
      tsconfig.compilerOptions = {}
    }
    if(tsconfig.compilerOptions.hasOwnProperty('baseUrl')){
      let absPath = path.resolve(this._workspaceDir,tsconfig.compilerOptions.baseUrl)
      replacePath = path.relative(this._workspaceDir,absPath)

    }else{
      tsconfig.compilerOptions.baseUrl = template.compilerOptions.baseUrl
    }
    // if(!(tsconfig.compilerOptions.hasOwnProperty("include")||tsconfig.compilerOptions.hasOwnProperty("exclude"))){
    //   tsconfig.exclude = template.exclude
    // }
    const config = Object.keys(alias).reduce((pre,cur)=>{
      let key = cur
      let modulePath = alias[cur].replace(Boolean(replacePath)?replacePath+'/':"","")
      let file;
      extensions.some(value=>{
        let result = alias[cur].endsWith(value)
        if(result){
          file = alias[cur]
        }
        return result
      })
      if(file){
        try {
          if(fs.lstatSync(path.resolve(this._workspaceDir,file)).isFile()){
            pre[key] = [modulePath]
          }
        } catch (error) {
          vscode.window.showInformationMessage(error)
        }

      }else{
        key+="/*"
        modulePath+="/*"
        pre[key] = [modulePath]
      }
      return pre
    },{})
    if(tsconfig.compilerOptions.hasOwnProperty("paths")){
      tsconfig.compilerOptions.paths = {...tsconfig.paths,...config}
    }
    fs.writeFileSync(configPath,JSON.stringify(tsconfig,null,2))
  }
}