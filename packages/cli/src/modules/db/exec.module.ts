import {cli} from 'cli-ux';
import chalk from 'chalk';
import {OnApplicationBootstrap, Module, Inject} from '@nestjs/common';
import {SystemModule, SystemProvider, DBMS_STATUS, NEO4J_EDITION} from '@relate/common';

import {isInteractive, readStdin} from '../../stdin';
import ExecCommand from '../../commands/db/exec';

import {selectDbmsPrompt, passwordPrompt} from '../../prompts';

@Module({
    exports: [],
    imports: [SystemModule],
    providers: [],
})
export class ExecModule implements OnApplicationBootstrap {
    constructor(
        @Inject('PARSED_PROVIDER') protected readonly parsed: ParsedInput<typeof ExecCommand>,
        @Inject('UTILS_PROVIDER') protected readonly utils: CommandUtils,
        @Inject(SystemProvider) protected readonly systemProvider: SystemProvider,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        const {flags} = this.parsed;
        const {database, from, user} = flags;
        const environment = await this.systemProvider.getEnvironment(flags.environment);

        let {dbms: dbmsId} = this.parsed.args;
        if (!dbmsId) {
            if (isInteractive()) {
                dbmsId = await selectDbmsPrompt('Select a DBMS to import data to', environment);
            } else {
                dbmsId = await readStdin();
            }
        }

        const dbms = await environment.dbmss.get(dbmsId);

        if (dbms.status === DBMS_STATUS.STOPPED) {
            cli.action.start(`Starting ${dbms.name} DBMS`);
            await environment.dbmss.start([dbmsId]);
            cli.action.stop(chalk.green('done'));
        }

        const accessToken =
            dbms.edition === NEO4J_EDITION.ENTERPRISE
                ? await this.systemProvider.getAccessToken(environment.id, dbms.id, user)
                : await passwordPrompt('Enter passphrase');

        return environment.dbs
            .exec(dbmsId, from, {
                database,
                user,
                accessToken,
            })
            .then((res: string) => {
                const message = ['------------------------------------------'];
                if (res.search(/unauthorized|Invalid input/) !== -1) {
                    message.push(chalk.red('Failed to import'));
                    message.push(res.trim());
                } else {
                    message.push(
                        `Successfully imported '${chalk.cyan(from)}' to ${chalk.cyan(dbms.name)}->${chalk.cyan(
                            database,
                        )}`,
                    );
                }
                this.utils.log(message.join('\n'));
            });
    }
}
