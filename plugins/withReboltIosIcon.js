const fs = require('fs');
const path = require('path');
const {
  withDangerousMod,
  withXcodeProject,
  IOSConfig,
  createRunOncePlugin,
} = require('expo/config-plugins');

const SOURCE_REL = 'assets/rebolt_icon.icon';
const ICON_DIR = 'rebolt_icon.icon';
/** Must match the Icon Composer filename without `.icon` (Xcode General → App Icon). */
const APPICON_NAME = 'rebolt_icon';

/**
 * Copies the Icon Composer bundle into the iOS app target folder, adds it to the
 * Xcode project with `lastKnownFileType = folder.iconcomposer.icon`, and sets
 * ASSETCATALOG_COMPILER_APPICON_NAME so the Liquid Glass icon is used on iOS 18+.
 */
function withReboltIosIcon(config) {
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const src = path.join(projectRoot, SOURCE_REL);
      if (!fs.existsSync(src)) {
        throw new Error(
          `[withReboltIosIcon] Missing ${SOURCE_REL}. Add your Icon Composer bundle at that path.`,
        );
      }
      const iosRoot = path.join(projectRoot, 'ios');
      const projFolder = IOSConfig.XcodeUtils.getProjectName(projectRoot);
      const dest = path.join(iosRoot, projFolder, ICON_DIR);
      fs.rmSync(dest, { recursive: true, force: true });
      fs.cpSync(src, dest, { recursive: true });
      return cfg;
    },
  ]);

  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const projectRoot = cfg.modRequest.projectRoot;
    const projFolder = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const relPath = path.posix.join(projFolder, ICON_DIR);

    IOSConfig.XcodeUtils.addResourceFileToGroup({
      filepath: relPath,
      groupName: projFolder,
      isBuildFile: true,
      project,
      verbose: true,
    });

    const fileRefs = project.pbxFileReferenceSection();
    for (const key of Object.keys(fileRefs)) {
      if (key.endsWith('_comment')) continue;
      const ref = fileRefs[key];
      const p = ref?.path;
      if (
        ref &&
        typeof p === 'string' &&
        (p === ICON_DIR || p.endsWith(`/${ICON_DIR}`) || p.includes('rebolt_icon.icon'))
      ) {
        ref.lastKnownFileType = 'folder.iconcomposer.icon';
      }
    }

    const configurations = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configurations)) {
      if (key.endsWith('_comment')) continue;
      const section = configurations[key];
      const bs = section.buildSettings;
      if (!bs) continue;
      if (Object.prototype.hasOwnProperty.call(bs, 'ASSETCATALOG_COMPILER_APPICON_NAME')) {
        bs.ASSETCATALOG_COMPILER_APPICON_NAME = APPICON_NAME;
      }
    }

    return cfg;
  });

  return config;
}

module.exports = createRunOncePlugin(withReboltIosIcon, 'with-rebolt-ios-icon-composer');
