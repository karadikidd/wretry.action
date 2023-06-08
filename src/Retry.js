const core = require('@actions/core');
const common = require('./Common.js');
require('../node_modules/Joined.s');
const fs = require('fs');
const path = require('path');
const _ = wTools;

//

function retry(scriptType) {
  return _.Consequence.Try(() => {
    let routine;
    const con = _.take(null);
    const actionName = core.getInput('action');
    const command = core.getMultilineInput('command');

    if (!actionName) {
      if (!command.length)
        throw _.error.brief('Please, specify Github action name or shell command.');

      let currentPath = core.getInput('current_path') || _.path.current();

      if (!_.path.isAbsolute(currentPath))
        currentPath = _.path.join(_.path.current(), currentPath);

      routine = () => {
        const o =
        {
          currentPath,
          execPath: command,
          inputMirroring: 0,
          stdio: 'inherit',
          mode: 'shell',
        };
        _.process.start(o);
        return o.ready;
      };
    }
    else {
      if (command.length)
        throw _.error.brief('Expects Github action name or command, but not both.');

      process.env.RETRY_ACTION = actionName;
      const remoteActionPath = common.remotePathFromActionName(actionName);
      // console.log('remoteActionPath')
      // console.log(remoteActionPath)
      const localActionPath = _.path.nativize(_.path.join(__dirname, '../../../', remoteActionPath.repo));
      // console.log('localActionPath')
      // console.log(localActionPath)

      con.then(() => common.actionClone(localActionPath, remoteActionPath));
      con.then(() => {
        const config = common.actionConfigRead(localActionPath);
        console.log('$$$$')
        console.log(JSON.stringify(config, null, 2))
        console.log('$$$$')
        if (!config.runs[scriptType])
          return null;

        const optionsStrings = core.getMultilineInput('with');
        console.log('####')
        console.log(JSON.stringify(optionsStrings, null, 2))
        console.log('####')

        const options = common.actionOptionsParse(optionsStrings);
        _.map.sureHasOnly(options, config.inputs);

        if (_.strBegins(config.runs.using, 'node')) {
          const envOptions = common.envOptionsFrom(options, config.inputs);
          common.envOptionsSetup(envOptions);

          const runnerPath = _.path.nativize(_.path.join(__dirname, 'Runner.js'));
          const scriptPath = _.path.nativize(_.path.join(localActionPath, config.runs[scriptType]));
          routine = () => {
            const o =
            {
              currentPath: _.path.current(),
              execPath: `node ${runnerPath} ${scriptPath}`,
              inputMirroring: 0,
              stdio: 'inherit',
              mode: 'spawn',
              ipc: 1,
            };
            _.process.start(o, (error, stdout, stderr) => {
              if (error) {
                console.error(`exec error: ${error}`)
                return
              }

              console.log('env vars:')
              console.log(process.env)
              const githubOutputPath = process.env.GITHUB_OUTPUT
              if (githubOutputPath) {
                const outputLines = fs.readFileSync(path.resolve(githubOutputPath), 'utf-8').split('\n');
                const outputs = {};
                outputLines.forEach(line => {
                  const [key, value] = line.split('=');
                  if (key && value) {
                    outputs[key] = value;
                  }
                });
                console.log('Outputs:', outputs);
              }
            });
            o.pnd.on('message', (data) => _.map.extend(process.env, data));
            return o.ready;
          };
        }
        else {
          throw _.error.brief('implemented only for NodeJS interpreter');
        }
        return null;
      });
    }

    /* */

    const attemptLimit = _.number.from(core.getInput('attempt_limit')) || 2;
    const attemptDelay = _.number.from(core.getInput('attempt_delay')) || 0;

    return con.then(() => {
      if (routine)
        return _.retry
          ({
            routine,
            attemptLimit,
            attemptDelay,
            onSuccess,
          });
      return null;
    });
  })
    .catch((error) => {
      _.error.attend(error);
      core.setFailed(_.error.brief(error.message));
      return error;
    });

  /* */

  function onSuccess(arg) {
    if (arg.exitCode !== 0)
      return false;
    return true
  };
}

module.exports = { retry };

