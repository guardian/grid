import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { GridExtras } from './grid-extras';

describe('The GridExtras stack', () => {
	it('matches the snapshot', () => {
		const app = new App();
		const stack = new GridExtras(app, 'GridExtras', {
			stack: 'media-service',
			stage: 'TEST',
			batchSize: 99, //arbitrary number under 1000
		});
		const template = Template.fromStack(stack);
		expect(template.toJSON()).toMatchSnapshot();
	});
});
