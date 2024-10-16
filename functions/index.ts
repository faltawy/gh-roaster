import {
    createLambdaFunction,
    createProbot,
} from "@probot/adapter-aws-lambda-serverless";
import appFn from "../src/index.js";

export const handler = createLambdaFunction(appFn, {
    probot: createProbot(),
});