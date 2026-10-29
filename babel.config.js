require('dotenv').config();

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['module:@react-native/babel-preset'],
    plugins: [
      ['transform-inline-environment-variables', {
        include: ['CLOUDFLARE_API_URL', 'USERNAME_CIPHER_KEY'],
      }],
    ],
  };
};
