import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ImageEmbedder } from './image-embedder-lambda';

describe('The MediaService stack', () => {
	it('matches the snapshot', () => {
		const app = new App();
		const stack = new ImageEmbedder(app, 'ImageEmbedderLambda', {
			stack: 'media-service',
			stage: 'TEST',
		});
		const template = Template.fromStack(stack);
		expect(template.toJSON()).toMatchSnapshot();
	});
});
