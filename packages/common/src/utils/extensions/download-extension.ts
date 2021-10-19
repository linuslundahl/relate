import fse from 'fs-extra';
import path from 'path';

import {FetchError, NotFoundError} from '../../errors';
import {extractExtension} from './extract-extension';
import {EXTENSION_URL_PATH, HOOK_EVENTS} from '../../constants';
import {discoverExtension} from './extension-versions';
import {download, requestJson, verifyHash} from '../download';
import {emitHookEvent} from '../event-hooks';
import {IExtensionInfo} from '../../models';

export interface IExtensionRegistryManifest {
    name: string;
    'dist-tags': {
        [latest: string]: string;
    };
    versions: {
        [version: string]: {
            name: string;
            version: string;
            dist: {
                tarball: string;
                shasum: string;
            };
        };
    };
}

export interface IFetchExtensionInfo {
    tarball: string;
    shasum: string;
}

const fetchExtensionInfo = async (extensionName: string, version: string): Promise<IFetchExtensionInfo> => {
    let res: IExtensionRegistryManifest;

    try {
        res = await requestJson(`${EXTENSION_URL_PATH}${extensionName}`);
    } catch (_error) {
        throw new FetchError(`Unable to find the requested extension: ${extensionName} online`);
    }

    if (!res.versions[version]) {
        throw new NotFoundError(`Unable to find the requested version: ${version} online`);
    }

    const {
        dist: {tarball, shasum},
    } = res.versions[version];

    return {
        shasum,
        tarball,
    };
};

export const downloadExtension = async (
    name: string,
    version: string,
    extensionDistributionsPath: string,
): Promise<IExtensionInfo> => {
    const {tarball, shasum} = await fetchExtensionInfo(name, version);

    await emitHookEvent(HOOK_EVENTS.RELATE_EXTENSION_DOWNLOAD_START, null);
    const downloadFilePath = await download(tarball, extensionDistributionsPath);
    await emitHookEvent(HOOK_EVENTS.RELATE_EXTENSION_DOWNLOAD_STOP, null);

    await verifyHash(shasum, downloadFilePath);

    // extract extension to cache dir first
    const extractPath = path.join(extensionDistributionsPath, `${name}@${version}.tmp`);
    const {
        name: extensionName,
        dist,
        version: extensionVersion,
    } = await extractExtension(downloadFilePath, extractPath);
    const destinationPath = path.join(extensionDistributionsPath, `${extensionName}@${extensionVersion}`);

    // move the extracted dir and remove the downloaded archive
    await emitHookEvent(HOOK_EVENTS.RELATE_EXTENSION_DIRECTORY_MOVE_START, `moving ${name} to data directory`);
    await fse.move(dist, destinationPath, {overwrite: true});
    await fse.remove(extractPath);
    await fse.remove(downloadFilePath);
    await emitHookEvent(HOOK_EVENTS.RELATE_EXTENSION_DIRECTORY_MOVE_STOP, null);

    return discoverExtension(destinationPath);
};
