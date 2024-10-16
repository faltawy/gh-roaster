import {
    createLambdaFunction,
    createProbot,
} from "@probot/adapter-aws-lambda-serverless";
import appFn from "../src/index.js";
console.log("appFn", appFn)
export const handler = createLambdaFunction(appFn, {
    probot: createProbot(),
});