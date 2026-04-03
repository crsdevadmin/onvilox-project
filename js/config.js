// CONFIGURATION: Centralized API URL
// After deploying the backend to AWS, replace the URL below with your endpoint:
//   AWS Elastic Beanstalk: "https://your-env.elasticbeanstalk.com"
//   AWS EC2:               "https://your-ec2-public-ip" (or domain)
//   AWS App Runner:        "https://xxxx.region.awsapprunner.com"
const CONFIG = {
  API_BASE_URL: "https://gquence.in"
};

console.log("ONVILOX_CONFIG_LOADED", CONFIG.API_BASE_URL);
