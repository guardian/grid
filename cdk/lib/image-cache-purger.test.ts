import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ImageCachePurger } from './image-cache-purger';

describe('The ImageCachePurger stack', () => {
	const createTemplate = () => {
		const app = new App();
		const stack = new ImageCachePurger(app, 'ImageCachePurgerLambda', {
			stack: 'media-service',
			stage: 'TEST',
			imageBaseUrl: 'https://media.test.dev-guim.co.uk',
			queueArn: 'arn:aws:sqs:eu-west-1:563563610310:test',
		});
		return Template.fromStack(stack);
	};
	it('matches the snapshot', () => {
		expect(createTemplate().toJSON()).toMatchSnapshot();
	});
});
