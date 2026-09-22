import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
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

	it('passes the secret ARN to the Lambda and grants permission to read it', () => {
		const template = createTemplate();

		template.hasResourceProperties('AWS::Lambda::Function', {
			Environment: {
				Variables: {
					FASTLY_API_KEY_SECRET_ID: Match.anyValue(),
					FASTLY_IMAGE_BASE_URL: 'https://media.test.dev-guim.co.uk',
				},
			},
		});
		template.hasResourceProperties('AWS::IAM::Policy', {
			PolicyDocument: {
				Statement: Match.arrayWith([
					Match.objectLike({
						Action: 'secretsmanager:GetSecretValue',
						Effect: 'Allow',
					}),
				]),
			},
		});
	});

	it('matches the snapshot', () => {
		expect(createTemplate().toJSON()).toMatchSnapshot();
	});
});
