/*\
Show local git state and sync to git on click.
Requires you are using TiddlyGit, and have install the "Inject JS" API with access to NodeJS and Electron API).

\*/
(function () {
  /*jslint node: true, browser: true */
  /*global $tw: true */
  'use strict';

  const Widget = require('$:/core/modules/widgets/widget.js').widget;

  class NodeJSGitSyncWidget extends Widget {
    /**
     * Lifecycle method: call this.initialise and super
     */
    constructor(parseTreeNode, options) {
      super(parseTreeNode, options);
      this.initialise(parseTreeNode, options);
      this.state = {
        needSetUp: false, // need to setup api, or just API missing
        interval: 1000, // check interval
        count: 0, // things need to commit
        unsync: false, // need to push to github
        syncing: false, // a sync is in progress
      };
      this.checkInLoop();
    }

    /**
     * Lifecycle method: Render this widget into the DOM
     */
    render(parent, nextSibling) {
      // boilerplate
      this.parentDomNode = parent;
      this.computeAttributes();

      // DOM
      const importButton = this.document.createElement('button');
      importButton.className = 'tc-btn-invisible tc-btn-plugins-linonetwo-nodejs-tiddlygit-git-sync ';
      importButton.onclick = this.onSyncButtonClick.bind(this);

      // set icon
      if (this.state.needSetUp) {
        // all commit and sync to cloud
        importButton.className += 'git-sync';
        importButton.disabled = true;
        // tooltip
        const label = '需要配置TiddlyGit';
        importButton.title = label;
        importButton['aria-label'] = label;
        // icon
        importButton.innerHTML = $tw.wiki.getTiddlerText(
          '$:/plugins/linonetwo/source-control-management/icons/git-sync.svg'
        );
      } else if (this.state.syncing) {
        // all commit and sync to cloud
        importButton.className += 'git-sync syncing';
        importButton.disabled = true;
        // tooltip
        const label = '正在同步到云端';
        importButton.title = label;
        importButton['aria-label'] = label;
        // icon
        importButton.innerHTML = $tw.wiki.getTiddlerText(
          '$:/plugins/linonetwo/source-control-management/icons/git-sync.svg'
        );
      } else if (this.state.count === 0 && !this.state.unsync) {
        // all commit and sync to cloud
        importButton.className += 'git-sync';
        importButton.disabled = true;
        // tooltip
        const label = '已完全同步到云端';
        importButton.title = label;
        importButton['aria-label'] = label;
        // icon
        importButton.innerHTML = $tw.wiki.getTiddlerText(
          '$:/plugins/linonetwo/source-control-management/icons/git-sync.svg'
        );
      } else if (this.state.count === 0 && this.state.unsync) {
        // some commit need to sync to the cloud
        importButton.className += 'git-pull-request';
        // tooltip
        const label = '待推送到云端';
        importButton.title = label;
        importButton['aria-label'] = label;
        // icon
        importButton.innerHTML = $tw.wiki.getTiddlerText(
          '$:/plugins/linonetwo/source-control-management/icons/git-pull-request.svg'
        );
      } else {
        // some need to commit, and not sync to cloud yet
        importButton.className += 'git-pull-request';
        // tooltip
        const label = `${this.state.count} 个文件待提交和推送`;
        importButton.title = label;
        importButton['aria-label'] = label;
        // icon
        const iconSVG = $tw.wiki.getTiddlerText(
          '$:/plugins/linonetwo/source-control-management/icons/git-pull-request.svg'
        );
        // add count indicator badge
        const countIndicator = `<span class="tiddlygit-scm-count tiddlygit-scm-count-small">${this.state.count}</span>`;
        importButton.innerHTML = `<span>${iconSVG}${countIndicator}</span>`;
      }

      // boilerplate
      parent.insertBefore(importButton, nextSibling);
      this.domNodes.push(importButton);
    }

    async getFolderInfo() {
      const list = await window.service.workspace.getWorkspacesAsList();
      return list.map(({ wikiFolderLocation: wikiPath, gitUrl }) => ({ wikiPath, gitUrl }));
    }

    /**
     * Event listener of button
     */
    async onSyncButtonClick() {
      if (!this.state.syncing && this.state.unsync) {
        this.state.syncing = true;
        this.refreshSelf();
        try {
          const folderInfo = await this.getFolderInfo();
          const repoStatuses = await Promise.all(
            folderInfo.map(({ wikiPath }) => window.service.git.getModifiedFileList(wikiPath))
          );

          const tasks = repoStatuses
            .filter((repoStatus) => repoStatus.length > 0)
            .map((repoStatus, index) => {
              const { wikiPath, gitUrl } = folderInfo[index];
              window.service.git.commitAndSync(wikiPath, gitUrl);
            });
          await Promise.all(tasks);
        } catch (error) {
          console.error('NodeJSGitSyncWidget: Error syncing', error);
        }
        this.state.syncing = false;
        this.refreshSelf();
      }
    }

    /**
     * Check state every a few time
     */
    async checkInLoop() {
      // check if API from TiddlyGit is available, first time it is Server Side Rendening so window.xxx from the electron ContextBridge will be missing
      if (
        !window.service.git ||
        typeof window.service.git.commitAndSync !== 'function' ||
        typeof window.service.git.getModifiedFileList !== 'function' ||
        typeof window.service.workspace.getWorkspacesAsList !== 'function'
      ) {
        this.state.needSetUp = true;
      } else {
        this.state.needSetUp = false;
        this.checkGitState();
      }
      setTimeout(() => {
        this.checkInLoop();
      }, this.state.interval);
    }

    /**
     *  Check repo git sync state and count of uncommit things
     */
    async checkGitState() {
      const folderInfo = await this.getFolderInfo();
      const repoStatuses = [];
      for (const folder of folderInfo) {
        const modifiedListString = $tw.wiki.getTiddlerText(`$:/state/scm-modified-file-list/${folder.wikiPath}`);
        if (modifiedListString !== undefined) {
          const modifiedListJSON = JSON.parse(modifiedListString);
          repoStatuses.push(modifiedListJSON);
        }
      }

      this.state.count = 0;
      this.state.unsync = false;
      for (const repoStatus of repoStatuses) {
        if (repoStatus.length) {
          this.state.count += repoStatus.length;
          this.state.unsync = true;
        }
      }

      return this.refreshSelf(); // method from super class, this is like React forceUpdate, we use it because it is not fully reactive on this.state change
    }
  }

  exports['nodejs-tiddlygit-git-sync'] = NodeJSGitSyncWidget;
})();
