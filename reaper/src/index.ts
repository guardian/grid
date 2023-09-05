import type { Response } from 'node-fetch';
import fetch from 'node-fetch';
import {
	getBatchSize,
	getMediaApiHostname,
	getMediaApiKey,
	storeRecord,
} from './util';

type HardDeletedStatuses = Record<
	string, // media ID
	{
		mainImage: true;
		thumb: true;
		optimisedPng: true;
	}
>;

const parseResponseAs =
	<T>() =>
	async (response: Response) => {
		if (!response.ok) {
			throw new Error(
				`Request failed: ${response.status} ${response.statusText}`,
			);
		}
		return (await response.json()) as T;
	};

export const handler = async () => {
	const batchSize = getBatchSize();
	const mediaApiImagesBaseUrl = `https://${await getMediaApiHostname()}/images`;
	const fetchOptions = {
		headers: {
			'Content-Type': 'application/json',
			'X-Gu-Media-Key': await getMediaApiKey(),
		},
	};

	const recordDate = new Date();

	const IDsToSoftDelete = await fetch(
		`${mediaApiImagesBaseUrl}/nextIdsToBeSoftReaped?size=${batchSize}`,
		fetchOptions,
	).then(parseResponseAs<string[]>());
	console.log({
		message: `${IDsToSoftDelete.length} images for soft deletion.`,
		IDsToSoftDelete,
	});
	if (IDsToSoftDelete.length > 0) {
		const softDeleteResponse = await fetch(
			`${mediaApiImagesBaseUrl}/batchSoftDelete`,
			{
				...fetchOptions,
				method: 'DELETE',
				body: JSON.stringify(IDsToSoftDelete),
			},
		);
		if (!softDeleteResponse.ok) {
			throw new Error(
				`Soft delete failed: ${softDeleteResponse.status} ${softDeleteResponse.statusText}`,
			);
		}
		console.log({ message: 'Soft delete succeeded.', IDsToSoftDelete });
		// TODO after delay consider ES check of all the IDs to ensure they're soft deleted
		await storeRecord(recordDate, { softDeleted: IDsToSoftDelete });
	}

	const IDsToHardDelete: string[] = await fetch(
		`${mediaApiImagesBaseUrl}/nextIdsToBeHardReaped?size=${batchSize}`,
		fetchOptions,
	).then(parseResponseAs<string[]>());
	console.log({
		message: `${IDsToHardDelete.length} images for hard deletion`,
		IDsToHardDelete,
	});
	if (IDsToHardDelete.length > 0) {
		await storeRecord(recordDate, {
			softDeleted: IDsToSoftDelete,
			hardDeleted: IDsToHardDelete,
		});

		const hardDeletedStatuses = await fetch(
			`${mediaApiImagesBaseUrl}/batchHardDelete`,
			{
				...fetchOptions,
				method: 'DELETE',
				body: JSON.stringify(IDsToHardDelete),
			},
		).then(parseResponseAs<HardDeletedStatuses>());
		// FIXME check for false values in the response
		console.log({
			message: 'Hard delete succeeded.',
			IDsToHardDelete,
			hardDeletedStatuses,
		});
		// TODO after delay consider ES check of all the IDs to ensure they're hard deleted
		await storeRecord(recordDate, {
			softDeleted: IDsToSoftDelete,
			hardDeleted: hardDeletedStatuses,
		});
	}
};
