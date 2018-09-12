module.exports = {
    'secret': 'digitalbugsdontbitewhenhungry',
    'gameServerUrl': process.env.NODE_ENV == 'production' ? 'https://sportimo-gameserver-prod.herokuapp.com' : 'https://sportimo.herokuapp.com'
};