import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ImageCachePurger } from './image-cache-purger';

describe('The ImageCachePurger stack', () => {
	it('matches the snapshot', () => {
		const app = new App();
		const stack = new ImageCachePurger(app, 'ImageCachePurgerLambda', {
			stack: 'media-service',
			stage: 'TEST',
      queueArn: 'arn:aws:sqs:eu-west-1:563563610310:test'
		});
		const template = Template.fromStack(stack);
		expect(template.toJSON()).toMatchSnapshot();
	});
});
