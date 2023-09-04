export const ENV_VAR_BATCH_SIZE = 'BATCH_SIZE';
export const ENV_VAR_MEDIA_API_HOSTNAME = 'MEDIA_API_HOSTNAME';
export const ENV_VAR_MEDIA_API_KEY = 'MEDIA_API_KEY';

export const getEnvVarOrThrow = (name: string) => {
	const value = process.env[name];
	if (!value) {
		throw Error(`Missing environment variable ${name}`);
	}
	return value;
};
