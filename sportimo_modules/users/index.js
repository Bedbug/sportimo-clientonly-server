'use strict';


// =======================
// get the packages we need 
// =======================
var express = require('express');
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var bcrypt = require("bcryptjs");
var crypto = require('crypto');   // built-in Node module in later versions

var jsonwebtoken = require('jsonwebtoken'); // used to create, sign, and verify tokens
var config = require('./config'), // get our config file
    User = mongoose.models.users, // get our mongoose model
    ObjectId = mongoose.Types.ObjectId,
    Message = require('../models/message'), // get our mongoose model
    UserActivities = mongoose.models.useractivities, // get our mongoose model
    Scores = mongoose.models.scores,
    Achievements = mongoose.models.achievements,
    Subscriptions = mongoose.models.subscriptions,
    CryptoJS = require("crypto-js");
var logger = require('winston');
var _ = require('lodash');
var async = require('async');
var moment = require('moment');
var needle = require('needle');
var moniker = require('moniker');

var MessagingTools = require.main.require('./sportimo_modules/messaging-tools');

var app = null;
var tools = {};


try {
    app = require('./../../server');
    module.exports = tools;
    // console.log(app.PublishChannel)
} catch (ex) {
    // Start server
    app = module.exports = exports.app = express.Router();
    var port = process.env.PORT || 3000;
    app.listen(port, function () {
        console.log('Express server listening on port %d in %s mode', port, app.get('env'));
    });
}

app.set('superSecret', config.secret); // secret variable


app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-Access-Token");
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    next();
});


// use body parser so we can get info from POST and/or URL parameters
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());


// ================
// API ROUTES -------------------
// ================
app.get('/v1/users/setup', function (req, res) {

    // create a sample user
    var nick = new User({
        name: 'Nick Cerminara',
        username: 'nickG',
        password: 'password',
        admin: true
    });

    // save the sample user
    nick.save(function (err) {
        if (err) throw err;

        console.log('User saved successfully');
        res.json({ success: true });
    });
});



// get an instance of the router for api routes
var apiRoutes = express.Router();



// route middleware to verify a token
var jwtMiddle = function (req, res, next) {

    // check header or url parameters or post parameters for token
    var token = req.body.token || req.query.token || req.headers['x-access-token'];

    // decode token
    if (token) {
        // verifies secret and checks exp
        jsonwebtoken.verify(token, app.get('superSecret'), { ignoreExpiration: true }, function (err, decoded) {
            if (err) {
                return res.json({ success: false, message: 'Failed to authenticate token.' });
            } else {
                // if everything is good, save to request for use in other routes
                User.findById(decoded.id)
                .populate({
                    path: 'favoriteteams',
                    select: 'name',
                    model: 'teams'
                })
                .exec((mongoErr, user) => {
                    if (mongoErr || !user) {
                        if (mongoErr)
                            logger.log('error', mongoErr.stack);

                        return res.json({ success: false, message: 'Failed to authenticate token.' });
                    }

                    if (user.deletedAt)
                        return res.json({ success: false, message: 'Failed to authenticate token.' });

                    req.decoded = user;
                    next();
                });
            }
        });

    } else {

        // if there is no token
        // return an error
        return res.status(403).send({
            success: false,
            message: 'No token provided.'
        });

    }
};

// Route to create a new user (POST /v1/users)
apiRoutes.post('/v1/users', function (req, res) {
    // save the sample user
    var newUser = new User(req.body);
    newUser.save(function (err, user) {
        if (err) {
            res.status(409).send(err); // conflict
        }
        else {
            var token = jsonwebtoken.sign({ id: user.id }, app.get('superSecret'), {
                expiresIn: 1440 * 60 // expires in 24 hours
            });
            user = user.toObject();
            user.token = token;
            user.success = true;
            // return the information including token as JSON
            res.status(200).send(user);
        }
    });
});

//Route to authenticate a user (POST /v1/users/authenticate)
apiRoutes.post('/v1/users/authenticate/social', function (req, res) {
    console.log(req.body);
    // find the user
    User.findOne({
        social_id: req.body.social_id,
        deletedAt: null
    })
        .populate({
            path: 'favoriteteams',
            select: 'name',
            model: 'teams'
        })
        .exec(function (err, user) {

            if (err) {
                logger.log('error', err.stack, req.body);
                return res.json({ success: false, message: 'Authentication failed.' });
            }

            if (!user) {
                return res.json({ success: false, message: 'Authentication failed. User not found.' });
            } else if (user) {
                user.onLogin(function (saveErr) {
                    if (saveErr) {
                        logger.log('error', saveErr.stack, req.body);
                    }

                    user = user.toObject();
                    var token = jsonwebtoken.sign({ id: user.id }, app.get('superSecret'), {
                        expiresIn: 1440 * 60 // expires in 24 hours
                    });

                    delete user.rankingStats;

                    user.token = token;
                    user.success = true;
                    user.server_time = moment.utc().format();
                    // return the information including token as JSON
                    res.status(200).send(user);
                });
            }

        })
});

//Route to authenticate a user (POST /v1/users/authenticate)
apiRoutes.post('/v1/users/authenticate', function (req, res) {

    // find the user
    User.findOne({
        $or: [{ username: req.body.username }, { email: req.body.username }],
        deletedAt: null
    })
     .populate({
            path: 'favoriteteams',
            select: 'name',
            model: 'teams'
        })
        .exec(function (err, user) {

            if (err) {
                logger.log('error', err.stack, req.body);
                return res.json({ success: false, message: 'Authentication failed.' });
            }

        if (!user) {
            return res.json({ success: false, message: 'Authentication failed. User not found.' });
        } else if (user) {

            // check if password matches
            user.comparePassword(req.body.password, function (err, isMatch) {
                if (!isMatch || err) {
                    if (err) 
                        logger.log('error', err.stack, req.body);

                    return res.json({ success: false, message: 'Authentication failed. Wrong password.' });
                } else {

                    // if user is found and password is right
                    user.onLogin(function (saveErr) {
                        if (saveErr) {
                            console.error(saveErr.stack);
                        }

                        // create a token
                        user = user.toObject();
                        var token = jsonwebtoken.sign({ id: user.id }, app.get('superSecret'), {
                            expiresIn: 1440 * 60 // expires in 24 hours
                        });

                        delete user.rankingStats;

                        user.token = token;
                        user.success = true;
                        user.server_time = moment.utc().format();
                        // return the information including token as JSON
                        return res.status(200).send(user);
                    });
                }
            });
        }

    });
});

// Route to return all users (GET http://localhost:8080/api/users)
apiRoutes.get('/v1/users', jwtMiddle, function (req, res) {
    User.find({
        deletedAt: null
    }, function (err, users) {
        res.json(users);
    });
});

// Route to return specific user (GET http://localhost:8080/api/users)
apiRoutes.get('/v1/users/:id', jwtMiddle, function (req, res) {
    // apiRoutes.get('/v1/users/:id',  function (req, res) {

    if (req.decoded.admin) {
        // Full user Profile
        User.findById(req.params.id, function (err, user) {
            res.json(user);
        });
    }
    else {
        // Mini Profile
        User.findById(req.params.id, '-inbox', function (err, user) {
            res.json(user);
        });
    }
});

apiRoutes.get('/v1/users/:id/reset', function (req, res) {

    User.findById(req.params.id, function (err, user) {
        var token = CryptoJS.SHA1(req.params.id + user.username + Date.now()).toString();
        user.resetToken = token;
        user.save(function (err, result) {
            if (!err)
                res.json({ "success": true, "text": "Reset email will be sent soon but anyway since I see you are in a hurry, here is your...", "token": token });
            else {
                logger.log('error', err.stack, req.body);
                res.json({ "success": false });
            }
        });
    });
});

apiRoutes.post('/v1/users/reset', function (req, res) {

    var emailBody = `
<!doctype html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">

<head>
    <!-- NAME: 1 COLUMN -->
    <!--[if gte mso 15]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>*|MC:SUBJECT|*</title>
    <style type="text/css">
            p {
            margin: 10px 0;
            padding: 0;
        }
        
        table {
            border-collapse: collapse;
        }
        
        h1,
        h2,
        h3,
        h4,
        h5,
        h6 {
            display: block;
            margin: 0;
            padding: 0;
        }
        
        img,
        a img {
            border: 0;
            height: auto;
            outline: none;
            text-decoration: none;
        }
        
        body,
        #bodyTable,
        #bodyCell {
            height: 100%;
            margin: 0;
            padding: 0;
            width: 100%;
        }
        
        #outlook a {
            padding: 0;
        }
        
        img {
            -ms-interpolation-mode: bicubic;
        }
        
        table {
            mso-table-lspace: 0pt;
            mso-table-rspace: 0pt;
        }
        
        .ReadMsgBody {
            width: 100%;
        }
        
        .ExternalClass {
            width: 100%;
        }
        
        p,
        a,
        li,
        td,
        blockquote {
            mso-line-height-rule: exactly;
        }
        
        a[href^=tel],
        a[href^=sms] {
            color: inherit;
            cursor: default;
            text-decoration: none;
        }
        
        p,
        a,
        li,
        td,
        body,
        table,
        blockquote {
            -ms-text-size-adjust: 100%;
            -webkit-text-size-adjust: 100%;
        }
        
        .ExternalClass,
        .ExternalClass p,
        .ExternalClass td,
        .ExternalClass div,
        .ExternalClass span,
        .ExternalClass font {
            line-height: 100%;
        }
        
        a[x-apple-data-detectors] {
            color: inherit !important;
            text-decoration: none !important;
            font-size: inherit !important;
            font-family: inherit !important;
            font-weight: inherit !important;
            line-height: inherit !important;
        }
        
        #bodyCell {
            padding: 10px;
        }
        
        .templateContainer {
            max-width: 600px !important;
        }
        
        a.mcnButton {
            display: block;
        }
        
        .mcnImage {
            vertical-align: bottom;
        }
        
        .mcnTextContent {
            word-break: break-word;
        }
        
        .mcnTextContent img {
            height: auto !important;
        }
        
        .mcnDividerBlock {
            table-layout: fixed !important;
        }
        /*@tab Page@section Background Style@tip Set the background color and top border for your email. You may want to choose colors that match your company\'s branding.*/
        
        body,
        #bodyTable {
            /*@editable*/
            background-color: #FAFAFA;
        }
        /*@tab Page@section Background Style@tip Set the background color and top border for your email. You may want to choose colors that match your company\'s branding.*/
        
        #bodyCell {
            /*@editable*/
            border-top: 0;
        }
        /*@tab Page@section Email Border@tip Set the border for your email.*/
        
        .templateContainer {
            /*@editable*/
            border: 0;
        }
        /*@tab Page@section Heading 1@tip Set the styling for all first-level headings in your emails. These should be the largest of your headings.@style heading 1*/
        
        h1 {
            /*@editable*/
            color: #38433d;
            /*@editable*/
            font-family: \'Open Sans\', \'Helvetica Neue\', Helvetica, Arial, sans-serif;/*@editable*/font-size:26px;/*@editable*/font-style:normal;/*@editable*/font-weight:bold;/*@editable*/line-height:125%;/*@editable*/letter-spacing:normal;/*@editable*/text-align:left;}/*@tab Page@section Heading 2@tip Set the styling for all second-level headings in your emails.@style heading 2*/h2{/*@editable*/color:#38433d;/*@editable*/font-family:Helvetica;/*@editable*/font-size:22px;/*@editable*/font-style:normal;/*@editable*/font-weight:bold;/*@editable*/line-height:125%;/*@editable*/letter-spacing:normal;/*@editable*/text-align:left;}/*@tab Page@section Heading 3@tip Set the styling for all third-level headings in your emails.@style heading 3*/h3{/*@editable*/color:#38433d;/*@editable*/font-family:Helvetica;/*@editable*/font-size:20px;/*@editable*/font-style:normal;/*@editable*/font-weight:bold;/*@editable*/line-height:125%;/*@editable*/letter-spacing:normal;/*@editable*/text-align:left;}/*@tab Page@section Heading 4@tip Set the styling for all fourth-level headings in your emails. These should be the smallest of your headings.@style heading 4*/h4{/*@editable*/color:#38433d;/*@editable*/font-family:Helvetica;/*@editable*/font-size:18px;/*@editable*/font-style:normal;/*@editable*/font-weight:bold;/*@editable*/line-height:125%;/*@editable*/letter-spacing:normal;/*@editable*/text-align:left;}/*@tab Preheader@section Preheader Style@tip Set the background color and borders for your email\'s preheader area.*/#templatePreheader{/*@editable*/background-color:#fafafa;/*@editable*/background-image:none;/*@editable*/background-repeat:no-repeat;/*@editable*/background-position:center;/*@editable*/background-size:cover;/*@editable*/border-top:0;/*@editable*/border-bottom:0;/*@editable*/padding-top:9px;/*@editable*/padding-bottom:9px;}/*@tab Preheader@section Preheader Text@tip Set the styling for your email\'s preheader text. Choose a size and color that is easy to read.*/#templatePreheader .mcnTextContent,#templatePreheader .mcnTextContent p{/*@editable*/color:#656565;/*@editable*/font-family:Helvetica;/*@editable*/font-size:12px;/*@editable*/line-height:150%;/*@editable*/text-align:left;}/*@tab Preheader@section Preheader Link@tip Set the styling for your email\'s preheader links. Choose a color that helps them stand out from your text.*/#templatePreheader .mcnTextContent a,#templatePreheader .mcnTextContent p a{/*@editable*/color:#656565;/*@editable*/font-weight:normal;/*@editable*/text-decoration:underline;}/*@tab Header@section Header Style@tip Set the background color and borders for your email\'s header area.*/#templateHeader{/*@editable*/background-color:#ffc631;/*@editable*/background-image:none;/*@editable*/background-repeat:no-repeat;/*@editable*/background-position:center;/*@editable*/background-size:cover;/*@editable*/border-top:0;/*@editable*/border-bottom:0;/*@editable*/padding-top:9px;/*@editable*/padding-bottom:0;}/*@tab Header@section Header Text@tip Set the styling for your email\'s header text. Choose a size and color that is easy to read.*/#templateHeader .mcnTextContent,#templateHeader .mcnTextContent p{/*@editable*/color:#202020;/*@editable*/font-family:Helvetica;/*@editable*/font-size:16px;/*@editable*/line-height:150%;/*@editable*/text-align:left;}/*@tab Header@section Header Link@tip Set the styling for your email\'s header links. Choose a color that helps them stand out from your text.*/#templateHeader .mcnTextContent a,#templateHeader .mcnTextContent p a{/*@editable*/color:#2BAADF;/*@editable*/font-weight:normal;/*@editable*/text-decoration:underline;}/*@tab Body@section Body Style@tip Set the background color and borders for your email\'s body area.*/#templateBody{/*@editable*/background-color:#ffffff;/*@editable*/background-image:none;/*@editable*/background-repeat:no-repeat;/*@editable*/background-position:center;/*@editable*/background-size:cover;/*@editable*/border-top:0;/*@editable*/border-bottom:2px solid #EAEAEA;/*@editable*/padding-top:0;/*@editable*/padding-bottom:9px;}/*@tab Body@section Body Text@tip Set the styling for your email\'s body text. Choose a size and color that is easy to read.*/#templateBody .mcnTextContent,#templateBody .mcnTextContent p{/*@editable*/color:#202020;/*@editable*/font-family:Helvetica;/*@editable*/font-size:16px;/*@editable*/line-height:150%;/*@editable*/text-align:left;}/*@tab Body@section Body Link@tip Set the styling for your email\'s body links. Choose a color that helps them stand out from your text.*/#templateBody .mcnTextContent a,#templateBody .mcnTextContent p a{/*@editable*/color:#2BAADF;/*@editable*/font-weight:normal;/*@editable*/text-decoration:underline;}/*@tab Footer@section Footer Style@tip Set the background color and borders for your email\'s footer area.*/#templateFooter{/*@editable*/background-color:#fafafa;/*@editable*/background-image:none;/*@editable*/background-repeat:no-repeat;/*@editable*/background-position:center;/*@editable*/background-size:cover;/*@editable*/border-top:0;/*@editable*/border-bottom:0;/*@editable*/padding-top:9px;/*@editable*/padding-bottom:9px;}/*@tab Footer@section Footer Text@tip Set the styling for your email\'s footer text. Choose a size and color that is easy to read.*/#templateFooter .mcnTextContent,#templateFooter .mcnTextContent p{/*@editable*/color:#656565;/*@editable*/font-family:Helvetica;/*@editable*/font-size:12px;/*@editable*/line-height:150%;/*@editable*/text-align:center;}/*@tab Footer@section Footer Link@tip Set the styling for your email\'s footer links. Choose a color that helps them stand out from your text.*/#templateFooter .mcnTextContent a,#templateFooter .mcnTextContent p a{/*@editable*/color:#656565;/*@editable*/font-weight:normal;/*@editable*/text-decoration:underline;}@media only screen and (min-width:768px){.templateContainer{width:600px !important;}}@media only screen and (max-width: 480px){body,table,td,p,a,li,blockquote{-webkit-text-size-adjust:none !important;}}@media only screen and (max-width: 480px){body{width:100% !important;min-width:100% !important;}}@media only screen and (max-width: 480px){#bodyCell{padding-top:10px !important;}}@media only screen and (max-width: 480px){.mcnImage{width:100% !important;}}@media only screen and (max-width: 480px){.mcnCartContainer,.mcnCaptionTopContent,.mcnRecContentContainer,.mcnCaptionBottomContent,.mcnTextContentContainer,.mcnBoxedTextContentContainer,.mcnImageGroupContentContainer,.mcnCaptionLeftTextContentContainer,.mcnCaptionRightTextContentContainer,.mcnCaptionLeftImageContentContainer,.mcnCaptionRightImageContentContainer,.mcnImageCardLeftTextContentContainer,.mcnImageCardRightTextContentContainer{max-width:100% !important;width:100% !important;}}@media only screen and (max-width: 480px){.mcnBoxedTextContentContainer{min-width:100% !important;}}@media only screen and (max-width: 480px){.mcnImageGroupContent{padding:9px !important;}}@media only screen and (max-width: 480px){.mcnCaptionLeftContentOuter .mcnTextContent,.mcnCaptionRightContentOuter .mcnTextContent{padding-top:9px !important;}}@media only screen and (max-width: 480px){.mcnImageCardTopImageContent,.mcnCaptionBlockInner .mcnCaptionTopContent:last-child .mcnTextContent{padding-top:18px !important;}}@media only screen and (max-width: 480px){.mcnImageCardBottomImageContent{padding-bottom:9px !important;}}@media only screen and (max-width: 480px){.mcnImageGroupBlockInner{padding-top:0 !important;padding-bottom:0 !important;}}@media only screen and (max-width: 480px){.mcnImageGroupBlockOuter{padding-top:9px !important;padding-bottom:9px !important;}}@media only screen and (max-width: 480px){.mcnTextContent,.mcnBoxedTextContentColumn{padding-right:18px !important;padding-left:18px !important;}}@media only screen and (max-width: 480px){.mcnImageCardLeftImageContent,.mcnImageCardRightImageContent{padding-right:18px !important;padding-bottom:0 !important;padding-left:18px !important;}}@media only screen and (max-width: 480px){.mcpreview-image-uploader{display:none !important;width:100% !important;}}@media only screen and (max-width: 480px){/*@tab Mobile Styles@section Heading 1@tip Make the first-level headings larger in size for better readability on small screens.*/h1{/*@editable*/font-size:22px !important;/*@editable*/line-height:125% !important;}}@media only screen and (max-width: 480px){/*@tab Mobile Styles@section Heading 2@tip Make the second-level headings larger in size for better readability on small screens.*/h2{/*@editable*/font-size:20px !important;/*@editable*/line-height:125% !important;}}@media only screen and (max-width: 480px){/*@tab Mobile Styles@section Heading 3@tip Make the third-level headings larger in size for better readability on small screens.*/h3{/*@editable*/font-size:18px !important;/*@editable*/line-height:125% !important;}}@media only screen and (max-width: 480px){/*@tab Mobile Styles@section Heading 4@tip Make the fourth-level headings larger in size for better readability on small screens.*/h4{/*@editable*/font-size:16px !important;/*@editable*/line-height:150% !important;}}@media only screen and (max-width: 480px){/*@tab Mobile Styles@section Boxed Text@tip Make the boxed text larger in size for better readability on small screens. We recommend a font size of at least 16px.*/.mcnBoxedTextContentContainer .mcnTextContent,.mcnBoxedTextContentContainer .mcnTextContent p{/*@editable*/font-size:14px !important;/*@editable*/line-height:150% !important;}}@media only screen and (max-width: 480px){/*@tab Mobile Styles@section Preheader Visibility@tip Set the visibility of the email\'s preheader on small screens. You can hide it to save space.*/#templatePreheader{/*@editable*/display:block !important;}}@media only screen and (max-width: 480px){/*@tab Mobile Styles@section Preheader Text@tip Make the preheader text larger in size for better readability on small screens.*/#templatePreheader .mcnTextContent,#templatePreheader .mcnTextContent p{/*@editable*/font-size:14px !important;/*@editable*/line-height:150% !important;}}@media only screen and (max-width: 480px){/*@tab Mobile Styles@section Header Text@tip Make the header text larger in size for better readability on small screens.*/#templateHeader .mcnTextContent,#templateHeader .mcnTextContent p{/*@editable*/font-size:16px !important;/*@editable*/line-height:150% !important;}}@media only screen and (max-width: 480px){/*@tab Mobile Styles@section Body Text@tip Make the body text larger in size for better readability on small screens. We recommend a font size of at least 16px.*/#templateBody .mcnTextContent,#templateBody .mcnTextContent p{/*@editable*/font-size:16px !important;/*@editable*/line-height:150% !important;}}@media only screen and (max-width: 480px){/*@tab Mobile Styles@section Footer Text@tip Make the footer content text larger in size for better readability on small screens.*/#templateFooter .mcnTextContent,#templateFooter .mcnTextContent p{/*@editable*/font-size:14px !important;/*@editable*/line-height:150% !important;}}
    </style>
</head>

<body>
    <center>
        <table align="center" border="0" cellpadding="0" cellspacing="0" height="100%" width="100%" id="bodyTable">
            <tr>
                <td align="center" valign="top" id="bodyCell">
                    <!-- BEGIN TEMPLATE // -->
                    <!--[if gte mso 9]><table align="center" border="0" cellspacing="0" cellpadding="0" width="600" style="width:600px;"><tr><td align="center" valign="top" width="600" style="width:600px;"><![endif]-->
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" class="templateContainer">
                        <tr>
                            <td valign="top" id="templatePreheader">
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnTextBlock" style="min-width:100%;">
                                    <tbody class="mcnTextBlockOuter">
                                        <tr>
                                            <td valign="top" class="mcnTextBlockInner" style="padding-top:9px;">
                                                <!--[if mso]><table align="left" border="0" cellspacing="0" cellpadding="0" width="100%" style="width:100%;"><tr><![endif]-->
                                                <!--[if mso]><td valign="top" width="390" style="width:390px;"><![endif]-->
                                                <table align="left" border="0" cellpadding="0" cellspacing="0" style="max-width:390px;" width="100%" class="mcnTextContentContainer">
                                                    <tbody>
                                                        <tr>
                                                            <td valign="top" class="mcnTextContent" style="padding-top:0; padding-left:18px; padding-bottom:9px; padding-right:18px;"> </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <!--[if mso]></td><![endif]-->
                                                <!--[if mso]><td valign="top" width="210" style="width:210px;"><![endif]-->
                                                <table align="left" border="0" cellpadding="0" cellspacing="0" style="max-width:210px;" width="100%" class="mcnTextContentContainer">
                                                    <tbody>
                                                        <tr>
                                                            <td valign="top" class="mcnTextContent" style="padding-top:0; padding-left:18px; padding-bottom:9px; padding-right:18px;"> <a href="*|ARCHIVE|*" target="_blank">View this email in your browser</a> </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <!--[if mso]></td><![endif]-->
                                                <!--[if mso]></tr></table><![endif]-->
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td valign="top" id="templateHeader">
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnImageBlock" style="min-width:100%;">
                                    <tbody class="mcnImageBlockOuter">
                                        <tr>
                                            <td valign="top" style="padding:9px" class="mcnImageBlockInner">
                                                <table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" class="mcnImageContentContainer" style="min-width:100%;">
                                                    <tbody>
                                                        <tr>
                                                            <td class="mcnImageContent" valign="top" style="padding-right: 9px; padding-left: 9px; padding-top: 0; padding-bottom: 0;"> <img align="left" alt="" src="https://gallery.mailchimp.com/edb5ef3c28289aa28d32465a1/images/94e943f4-3d9d-4d83-b9ca-5a67decbc4f9.png" width="40" style="max-width:40px; padding-bottom: 0; display: inline !important; vertical-align: bottom;" class="mcnImage"> </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td valign="top" id="templateBody">
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnTextBlock" style="min-width:100%;">
                                    <tbody class="mcnTextBlockOuter">
                                        <tr>
                                            <td valign="top" class="mcnTextBlockInner" style="padding-top:9px;">
                                                <!--[if mso]><table align="left" border="0" cellspacing="0" cellpadding="0" width="100%" style="width:100%;"><tr><![endif]-->
                                                <!--[if mso]><td valign="top" width="600" style="width:600px;"><![endif]-->
                                                <table align="left" border="0" cellpadding="0" cellspacing="0" style="max-width:100%; min-width:100%;" width="100%" class="mcnTextContentContainer">
                                                    <tbody>
                                                        <tr>
                                                            <td valign="top" class="mcnTextContent" style="padding-top:0; padding-right:18px; padding-bottom:9px; padding-left:18px;">
                                                                <h1 class="null" style="text-align: right;"><span style="font-family:open sans,helvetica neue,helvetica,arial,sans-serif">&nbsp;!' + user.username + ' مرحبا </span><br>&nbsp;</h1>
                                                                <p style="text-align: right;">لقد وصلتك هذه الرسالة لأنك طلبت إعادة تعيين كلمة السر الخاصة بتطبيق Sportimo
                                                                    <br>لتغيير كلمة السر الخاصة بك أضغط على الرابط التالي واتبع التعليمات
                                                                    <br>&nbsp;</p>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <!--[if mso]></td><![endif]-->
                                                <!--[if mso]></tr></table><![endif]-->
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnButtonBlock" style="min-width:100%;">
                                    <tbody class="mcnButtonBlockOuter">
                                        <tr>
                                            <td style="padding-top:0; padding-right:18px; padding-bottom:18px; padding-left:18px;" valign="top" align="center" class="mcnButtonBlockInner">
                                                <table border="0" cellpadding="0" cellspacing="0" class="mcnButtonContentContainer" style="border-collapse: separate !important;border: 1px solid #FAD24E;border-radius: 3px;background-color: #FFC631;">
                                                    <tbody>
                                                        <tr>
                                                            <td align="center" valign="middle" class="mcnButtonContent" style="font-family: &quot;Open Sans&quot;, &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif; font-size: 16px; padding: 14px;"> <a class="mcnButton " title="reset_password" href="https://sportimo-reset-password.herokuapp.com/#/reset/' + token + '" target="_blank" style="font-weight: bold;letter-spacing: normal;line-height: 100%;text-align: center;text-decoration: none;color: #38433D;">تغيير كلمة السر</a> </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnTextBlock" style="min-width:100%;">
                                    <tbody class="mcnTextBlockOuter">
                                        <tr>
                                            <td valign="top" class="mcnTextBlockInner" style="padding-top:9px;">
                                                <!--[if mso]><table align="left" border="0" cellspacing="0" cellpadding="0" width="100%" style="width:100%;"><tr><![endif]-->
                                                <!--[if mso]><td valign="top" width="600" style="width:600px;"><![endif]-->
                                                <table align="left" border="0" cellpadding="0" cellspacing="0" style="max-width:100%; min-width:100%;" width="100%" class="mcnTextContentContainer">
                                                    <tbody>
                                                        <tr>
                                                            <td valign="top" class="mcnTextContent" style="padding-top:0; padding-right:18px; padding-bottom:9px; padding-left:18px;">
                                                                <table border="0" cellpadding="0" cellspacing="0">
                                                                    <tbody>
                                                                        <tr>
                                                                            <td dir="RTL" style="text-align: right;">إذا لم تطلب إعادة تعيين كلمة السر الخاصة بك لا تقلق! من الممكن ان يكون أحد اللاعبين الآخرين أدخل بريدك الالكتروني بالخطأ خلال طلبه إعاده تعيين كلمة السر الخاصة به. حسابك في أمان، يمكنك تجاهل هذه الرسالة.</td>
                                                                        </tr>
                                                                    </tbody>
                                                                </table>
                                                                <div style="text-align: right;">&nbsp;</div>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <!--[if mso]></td><![endif]-->
                                                <!--[if mso]></tr></table><![endif]-->
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnTextBlock" style="min-width:100%;">
                                    <tbody class="mcnTextBlockOuter">
                                        <tr>
                                            <td valign="top" class="mcnTextBlockInner" style="padding-top:9px;">
                                                <!--[if mso]><table align="left" border="0" cellspacing="0" cellpadding="0" width="100%" style="width:100%;"><tr><![endif]-->
                                                <!--[if mso]><td valign="top" width="600" style="width:600px;"><![endif]-->
                                                <table align="left" border="0" cellpadding="0" cellspacing="0" style="max-width:100%; min-width:100%;" width="100%" class="mcnTextContentContainer">
                                                    <tbody>
                                                        <tr>
                                                            <td valign="top" class="mcnTextContent" style="padding-top:0; padding-right:18px; padding-bottom:9px; padding-left:18px;">
                                                                <div style="text-align: right;">Sportimo&nbsp;فريق</div>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <!--[if mso]></td><![endif]-->
                                                <!--[if mso]></tr></table><![endif]-->
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnTextBlock" style="min-width:100%;">
                                    <tbody class="mcnTextBlockOuter">
                                        <tr>
                                            <td valign="top" class="mcnTextBlockInner" style="padding-top:9px;">
                                                <!--[if mso]><table align="left" border="0" cellspacing="0" cellpadding="0" width="100%" style="width:100%;"><tr><![endif]-->
                                                <!--[if mso]><td valign="top" width="600" style="width:600px;"><![endif]-->
                                                <table align="left" border="0" cellpadding="0" cellspacing="0" style="max-width:100%; min-width:100%;" width="100%" class="mcnTextContentContainer">
                                                    <tbody>
                                                        <tr>
                                                            <td valign="top" class="mcnTextContent" style="padding-top:0; padding-right:18px; padding-bottom:9px; padding-left:18px;">
                                                                <h1 class="null"><span style="font-family:open sans,helvetica neue,helvetica,arial,sans-serif">Hello ' + user.username + '!</span></h1>
                                                                <p><span style="font-size:14px"><span style="font-family:open sans,helvetica neue,helvetica,arial,sans-serif">You\'re receiving this e-mail because you requested to reset you Sportimo password. To&nbsp;reset&nbsp;your&nbsp;password, click the following link and follow the instructions:&nbsp;</span></span>
                                                                </p>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <!--[if mso]></td><![endif]-->
                                                <!--[if mso]></tr></table><![endif]-->
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnButtonBlock" style="min-width:100%;">
                                    <tbody class="mcnButtonBlockOuter">
                                        <tr>
                                            <td style="padding-top:0; padding-right:18px; padding-bottom:18px; padding-left:18px;" valign="top" align="center" class="mcnButtonBlockInner">
                                                <table border="0" cellpadding="0" cellspacing="0" class="mcnButtonContentContainer" style="border-collapse: separate !important;border: 1px solid #FAD24E;border-radius: 3px;background-color: #FFC631;">
                                                    <tbody>
                                                        <tr>
                                                            <td align="center" valign="middle" class="mcnButtonContent" style="font-family: &quot;Open Sans&quot;, &quot;Helvetica Neue&quot;, Helvetica, Arial, sans-serif; font-size: 16px; padding: 14px;"> <a class="mcnButton " title="reset_password" href="https://sportimo-reset-password.herokuapp.com/#/reset/' + token + '" target="_blank" style="font-weight: bold;letter-spacing: normal;line-height: 100%;text-align: center;text-decoration: none;color: #38433D;">RESET PASSWORD</a> </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnTextBlock" style="min-width:100%;">
                                    <tbody class="mcnTextBlockOuter">
                                        <tr>
                                            <td valign="top" class="mcnTextBlockInner" style="padding-top:9px;">
                                                <!--[if mso]><table align="left" border="0" cellspacing="0" cellpadding="0" width="100%" style="width:100%;"><tr><![endif]-->
                                                <!--[if mso]><td valign="top" width="600" style="width:600px;"><![endif]-->
                                                <table align="left" border="0" cellpadding="0" cellspacing="0" style="max-width:100%; min-width:100%;" width="100%" class="mcnTextContentContainer">
                                                    <tbody>
                                                        <tr>
                                                            <td valign="top" class="mcnTextContent" style="padding-top:0; padding-right:18px; padding-bottom:9px; padding-left:18px;">
                                                                <p dir="ltr"><span style="font-size:14px"><font face="arial, helvetica, sans-serif">If you didn\'t ask to reset your password, don\'t worry! It\'s possible that another user entered your email address by mistake when trying to&nbsp;reset&nbsp;their own&nbsp;password.&nbsp;Your account is safe, and you can ignore this email</font></span></p>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <!--[if mso]></td><![endif]-->
                                                <!--[if mso]></tr></table><![endif]-->
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnTextBlock" style="min-width:100%;">
                                    <tbody class="mcnTextBlockOuter">
                                        <tr>
                                            <td valign="top" class="mcnTextBlockInner" style="padding-top:9px;">
                                                <!--[if mso]><table align="left" border="0" cellspacing="0" cellpadding="0" width="100%" style="width:100%;"><tr><![endif]-->
                                                <!--[if mso]><td valign="top" width="600" style="width:600px;"><![endif]-->
                                                <table align="left" border="0" cellpadding="0" cellspacing="0" style="max-width:100%; min-width:100%;" width="100%" class="mcnTextContentContainer">
                                                    <tbody>
                                                        <tr>
                                                            <td valign="top" class="mcnTextContent" style="padding-top:0; padding-right:18px; padding-bottom:9px; padding-left:18px;"> <span style="font-size:14px"><span style="font-family:open sans,helvetica neue,helvetica,arial,sans-serif">Team Sportimo</span></span>
                                                            </td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                <!--[if mso]></td><![endif]-->
                                                <!--[if mso]></tr></table><![endif]-->
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td valign="top" id="templateFooter"></td>
                        </tr>
                    </table>
                    <!--[if gte mso 9]></td></tr></table><![endif]-->
                    <!-- // END TEMPLATE -->
                </td>
            </tr>
        </table>
    </center>
</body>

</html>`;

    User.findOne({ email: req.body.email }, function (err, user) {
        if (user) {
            var token = CryptoJS.SHA1(req.params.id + user.username + Date.now()).toString();
            user.resetToken = token;
            user.save(function (err, result) {
                if (!err) {
                    res.json({ "success": true, "redirect": false, "text": { en: "An email with a link to reset your password will be sent to you shortly." }, "token": token });
                    // setup e-mail data with unicode symbols
                    var mailOptions = {
                        from: 'info@sportimo.com', // sender address
                        to: req.body.email, // list of receivers
                        subject: 'Reset link from Sportimo', // Subject line
                        // text: 'Hello world', // plaintext body
                        html: emailBody
                        // 'You are receiving this email because you requested to reset the password of ' + user.username + '. <br/><br/><b>Here is your link:</b><br>https://sportimo-reset-password.herokuapp.com/#/reset/' + token
                    };

                    // send mail with defined transport object
                    MessagingTools.sendEmailToUser(mailOptions, function (error, info) {
                        if (error) {
                            logger.log('error', error.stack, req.body);
                            return res.json({ "success": false });
                        }
                        console.log('Message sent: ' + info.response);
                    });
                } else {
                    res.json({ "success": false });
                    return res.json({ "success": false });
                }
            })
        }
        else {
            console.log("User Email Reset: Email not found");
            res.status(404).send({ "en": "Email not found", "ar": "Arabic: Email not found" });
        }
    });
});


apiRoutes.get('/v1/users/:utoken/token', function (req, res) {
    User.findOne({ resetToken: req.params.utoken }, function (err, user) {
        res.json(user);
    })
});

apiRoutes.post('/v1/users/:utoken/password/reset', function (req, res) {
    User.findOne({ resetToken: req.params.utoken }, function (err, user) {
        user.password = req.body.password;
        user.save(function (err, response) {
            if (err) {
                logger.log('error', err.stack, req.body);
                res.send({ success: false });
            }
            else
                res.send({ success: true });
        })
    })
});

apiRoutes.post('/v1/users/token', function (req, res) {
    if (req.body.token == null)
        return res.status(404).send();

    User.findOne({
        resetToken: req.body.token,
        deletedAt: null
    }, function (err, user) {
        if (err)
            logger.log('error', err.stack, req.body);

        res.json(user);
    })
});


// Allowed mini user obejct
apiRoutes.get('/v1/user/:id', function (req, res) {

    User.findById(req.params.id, '-inbox', function (err, user) {
        res.json(user);
    });

});

// Update specific user (PUT /v1/users)
apiRoutes.put('/v1/users/:id', function (req, res) {

    if (req.body["picture"] != null)
        Scores.update({ user_id: req.params.id }, { $set: { 'pic': req.body["picture"] } }, { multi: true }, function (err, result) {
            console.log("users.index.js:320 Pic changed");
        });

    if (req.body["password"] != null) {
        console.log("IS NEW PASSWORD?: true");
        bcrypt.genSalt(10, function (err, salt) {
            if (err) {
                logger.log('error', err.stack, req.body);
                return next(err);
            }

            bcrypt.hash(req.body["password"], salt, function (err, hash) {
                if (err) {
                    logger.log('error', err.stack, req.body);
                    return next(err);
                }
                req.body["password"] = hash;

                User.findOneAndUpdate({
                    _id: req.params.id,
                    deletedAt: null
                    }, req.body, function (err) {
                    if (err) {
                        logger.log('error', err.stack, req.body);
                        res.status(500).send(err);
                    } else {
                        res.send({ success: true });
                    }
                });
            });
        });
    }
    else {

        // Sanitize changed username
        if (req.body.username) {
            // If the username is empty, ignore username changes in req.body
            if (req.body.username == '')
                delete req.body.username;
            else 
                req.body.username = req.body.username.replace(/[&\/\\#,+()$~ %.'":*?<>{}]/g, '_');
        }
        
        User.findOneAndUpdate({
            _id: req.params.id,
            deletedAt: null
        }, req.body, function (err, originalUser) {
            if (err) {
                logger.log('error', err.stack, req.body);
                res.status(500).send(err);
            } else {
                if (req.body && originalUser && req.body.username && req.body.username != originalUser.username) {
                    // update Scores collection with new username
                    Scores.update({ user_id: originalUser.id, user_name: originalUser.username }, { user_name: req.body.username }, { multi: true }, function (err) {
                        if (err) {
                            logger.log('error', err.stack, req.body);
                            res.status(500).send(err);
                        } else {
                            res.send({ success: true });
                        }
                    });
                }
                else 
                    res.send({ success: true });
            }
        });
    }
});


// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// @@ 
// @@   New non-intrusive single sign-on and related endpoints
// @@   in tandem with platform (iOS/Android) service authorization


apiRoutes.post('/v1/users/single_signon', (req, res) => {
    // Workflow
    // 1. If a social_id is included, find user through it
    // 1.1 If found, return user
    // 1.2 If social_id is not included or the user is not found, and a token is included, find user through token id
    // 1.2.1 If a token is included, find user through token
    // 1.2.1.1 If the user is not found, return 404 Not Found
    // 1.2.1.2 If the user is found and social_id is included, append it in the user object, save and return the user
    // 1.2.2 If a token is not included, create a new user
    // 1.2.2.1 If social_id is included, append it to the new user object before saving and return the new user
    // 1.2.2.2 else, save and return the new user

    var token = req.body.token || req.query.token || req.headers['x-access-token'];
    var hasLoginCredentials = req.body.username && req.body.password;

    var translateUser = function (user, callback) {

        const userObject = user.toObject();
        user.onLogin((saveErr) => {
            if (saveErr) {
                logger.error('Error saving user last login time: ', saveErr.stack);
            }

            // create a token
            var token = jsonwebtoken.sign({ id: user.id }, app.get('superSecret'), {
                expiresIn: 1440 * 60 // expires in 24 hours
            });

            delete userObject.rankingStats;

            userObject.token = token;
            userObject.success = true;
            userObject.server_time = moment.utc().format();

            return callback(null, userObject);
        });
    }

    var validateToken = function (token, callback) {
        jsonwebtoken.verify(token, app.get('superSecret'), { ignoreExpiration: true }, function (err, decodedUser) {
            if (err) {
                return callback(err);
            } else {
                // if everything is good, save to request for use in other routes
                logger.debug('Decoded user is: ', decodedUser);

                User.findOne({ _id: new ObjectId(decodedUser.id), deletedAt: null })
                    .populate({
                        path: 'favoriteteams',
                        select: 'name',
                        model: 'teams'
                    })
                    .exec(function (err, user) {
                        if (err) 
                            return callback(err);

                        //if (!user) {
                        //    return callback(new Error(`Authentication failed. User not found.`));
                        //}

                        return callback(null, user);
                    });
            }
        });
    }

    var createUser = function (social_id, social_platform, social_username, callback) {
        // create a new account
        // if social_id is includded in the body, store it in the user object
        // create a magic-numbers account linking code

        var newUser = new User();
        newUser._id = new ObjectId();
        if (social_id) {
            newUser.social_ids = {};
            newUser.social_ids[social_platform] = social_id;
        }
        newUser.createdAt = new Date();

        // Generate a unique username 
        var hexCompressed = crypto.createHash('md5').update(newUser.id).digest('base64').replace(/[+\/=]/g, '');
        newUser.username = moniker.choose();
        var usernameParts = newUser.username.split("-");
        if (usernameParts.length > 1)
            newUser.username = usernameParts[0].charAt(0).toUpperCase() + usernameParts[0].substr(1) + usernameParts[1].charAt(0).toUpperCase() + usernameParts[1].substr(1);

        if (social_username)
            newUser.username = social_username; // test for uniqueness

        // Generate a unique password
        newUser.password = CryptoJS.SHA1(newUser.id + newUser.username + newUser.createdAt).toString();

        // Generate a unique email
        newUser.email = newUser.username + '@sportimo.com';

        var usernameIsUnique = false;
        var usernameCounter = 0;

        // Keep on trying until generating a unique username
        async.until(
            () => { return usernameIsUnique; },
            (cbk) => {
                User.findOne({ username: newUser.username, deletedAt: null }, (err, user) => {
                    if (!user)
                        usernameIsUnique = true;
                    else {
                        newUser.username = moniker.choose();
                        newUser.email = newUser.username + '@sportimo.com';
                        newUser.password = CryptoJS.SHA1(newUser.id + newUser.username + newUser.createdAt).toString();
                    }

                    return cbk(err, newUser);
                });
            },
            (err, user) => {
                if (err)
                    return callback(err);

                return newUser.save(callback);
            }
        );
    }

    var authenticateUser = function (username, password, callback) {
        User.findOne({ username: username, deletedAt: null })
        .populate({
            path: 'favoriteteams',
            select: 'name',
            model: 'teams'
        })
        .exec((err, user) => {
            if (err) {
                return callback(err);
            }

            if (!user) {
                //return callback(new Error(`Authentication failed. User not found.`));
                return callback(null, null);
            }

            user.comparePassword(req.body.password, function (err, isMatch) {
                if (err) {
                    if (err)
                        logger.log('error', err.stack);

                    return callback(new Error('Authentication failed. Wrong password.'));
                }

                if (!isMatch) {
                    return callback(null, null);
                }

                return callback(null, user);
            });
        });
    }


    if (req.body.social_id && req.body.social_platform) {
        User.findOne({
            ['social_ids.' + req.body.social_platform]: req.body.social_id
        })
        .populate({
            path: 'favoriteteams',
            select: 'name',
            model: 'teams'
        })
        .exec(function (err, user) {
            if (err) {
                logger.log('error', err.stack, req.body);
                return res.json({ success: false, message: 'Authentication failed.' });
            }

            if (!user) {
                if (!token) {
                    if (!hasLoginCredentials) {
                        createUser(req.body.social_id, req.body.social_platform, req.body.social_username, (err, user) => {
                            if (err) {
                                logger.log('error', err.stack, req.body);
                                return res.json({ success: false, message: 'Authentication failed.' });
                            }

                            translateUser(user, (err, userObj) => {
                                return res.json(userObj);
                            });
                        });
                    } else {
                        authenticateUser(req.body.username, req.body.password, (err, user) => {
                            if (err) {
                                logger.log('error', err.stack, req.body);
                                return res.json({ success: false, message: 'Authentication failed. Wrong username or password.' });
                            }

                            if (!user) {
                                createUser(req.body.social_id, req.body.social_platform, req.body.social_username, (err, user) => {
                                    if (err) {
                                        logger.log('error', err.stack, req.body);
                                        return res.json({ success: false, message: 'Authentication failed.' });
                                    }

                                    translateUser(user, (err, userObj) => {
                                        return res.json(userObj);
                                    });
                                });
                            } else {

                                async.waterfall([
                                    (cbk) => {
                                        if (req.body.social_id && req.body.social_platform && !user.social_ids[req.body.social_platform]) {
                                            user.social_ids[req.body.social_platform] = req.body.social_id;
                                            user.markModified('social_ids');
                                            return user.save((err) => { return cbk(err, user); });
                                        } else {
                                            return async.setImmediate(() => { cbk(null, user); });
                                        }
                                    },
                                    (user, cbk) => {
                                        return translateUser(user, cbk);
                                    }
                                ], (err, userObj) => {
                                    if (err) {
                                        logger.log('error', err.stack, req.body);
                                        return res.json({ success: false, message: 'Authentication failed.' });
                                    }

                                    return res.json(userObj);
                                });
                            }
                        });
                    }
                } else {
                    validateToken(token, (err, user) => {
                        if (err) {
                            logger.log('error', err.stack, req.body);
                            return res.json({ success: false, message: 'Authentication failed.' });
                        }

                        if (!user) {
                            //return res.json({ success: false, message: 'Authentication failed. User not found.' });
                            createUser(req.body.social_id, req.body.social_platform, req.body.social_username, (err, user) => {
                                if (err) {
                                    logger.log('error', err.stack, req.body);
                                    return res.json({ success: false, message: 'Authentication failed.' });
                                }

                                translateUser(user, (err, userObj) => {
                                    return res.json(userObj);
                                });
                            });
                        } else {
                            if (req.body.social_id && req.body.social_platform && !user.social_ids[req.body.social_platform]) {
                                user.social_ids[req.body.social_platform] = req.body.social_id;
                                user.markModified('social_ids');
                                user.save((err) => {
                                    if (err) {
                                        logger.log('error', err.stack, req.body);
                                        return res.json({ success: false, message: 'Authentication failed.' });
                                    }

                                    translateUser(user, (err, userObj) => {
                                        return res.json(userObj);
                                    });
                                });
                            } else {
                                translateUser(user, (err, userObj) => {
                                    return res.json(userObj);
                                });
                            }
                        }
                    });
                }
            } else {
                translateUser(user, (err, userObj) => {
                    return res.json(userObj);
                });
            }
        });
    } else {
        if (!token) {
            if (!hasLoginCredentials) {
                createUser(req.body.social_id, req.body.social_platform, req.body.social_username, (err, user) => {
                    if (err) {
                        logger.log('error', err.stack, req.body);
                        return res.json({ success: false, message: 'Authentication failed.' });
                    }

                    translateUser(user, (err, userObj) => {
                        return res.json(userObj);
                    });
                });
            } else {
                authenticateUser(req.body.username, req.body.password, (err, user) => {
                    if (err) {
                        logger.log('error', err.stack, req.body);
                        return res.json({ success: false, message: 'Authentication failed. Wrong username or password.' });
                    }

                    if (!user) {
                        createUser(req.body.social_id, req.body.social_platform, req.body.social_username, (err, user) => {
                            if (err) {
                                logger.log('error', err.stack, req.body);
                                return res.json({ success: false, message: 'Authentication failed.' });
                            }

                            translateUser(user, (err, userObj) => {
                                return res.json(userObj);
                            });
                        });
                    } else {
                        translateUser(user, (err, userObj) => {
                            return res.json(userObj);
                        });
                    }

                });
            }
        } else {
            validateToken(token, (err, user) => {
                if (err) {
                    logger.log('error', err.stack, req.body);
                    return res.json({ success: false, message: 'Authentication failed.' });
                }

                if (!user) {
                    //return res.json({ success: false, message: 'Authentication failed. User not found.' });
                    createUser(req.body.social_id, req.body.social_platform, req.body.social_username, (err, user) => {
                        if (err) {
                            logger.log('error', err.stack, req.body);
                            return res.json({ success: false, message: 'Authentication failed.' });
                        }

                        translateUser(user, (err, userObj) => {
                            return res.json(userObj);
                        });
                    });
                } else {
                    translateUser(user, (err, userObj) => {
                        return res.json(userObj);
                    });
                }
            });
        }
    }
});



// Create link code (number) to establish link between platform accounts
apiRoutes.get('/v1/users/single_signon/linkcode', jwtMiddle, (req, res) => {
    const getRandomCode = function () {
        return `${_.random(0, 9)}${_.random(0, 9)}${_.random(0, 9)}${_.random(0, 9)}${_.random(0, 9)}`;
    }

    const linkCodes = mongoose.models.userlinkcodes;
    let linkingCodeDocument = new linkCodes({
        createdAt: new Date(),
        userId: req.decoded.id,
        code: getRandomCode()
    });
    let codeIsUnique = false;
    async.until(
        () => { return codeIsUnique; },
        (innerCbk) => {
            linkCodes.findOne({ code: linkingCodeDocument.code }, { _id: true }, (err, user) => {
                if (err)
                    return innerCbk(err);

                if (!user)
                    codeIsUnique = true;
                else
                    linkingCodeDocument.code = getRandomCode();

                return innerCbk(err, linkingCodeDocument);
            });
        },
        (err, codeDocument) => {
            if (err) {
                logger.log('error', err.stack, req.body);
                return res.json({ success: false });
            }

            codeDocument.save((mongoErr, insertResult) => {
                if (mongoErr) {
                    logger.log('error', mongoErr.stack, req.body);
                    return res.json({ success: false });
                }

                return res.json({ success: true, linkCode: codeDocument.code }).send();
            });
        }
    );
});


// Provide link code (number) to establish link between platform accounts
apiRoutes.post('/v1/users/single_signon/linkcode', jwtMiddle, (req, res) => {
    const newUser = req.decoded;
    const linkCode = req.body.linkCode;

    if (!linkCode)
        //return res.json({ success: false, message: 'The linkCode is missing' }).send(); // 401 - malformed
        return res.json({ success: false, status: 400 }).send();

    const linkCodes = mongoose.models.userlinkcodes;

    // Find the user id from the linkingCode
    linkCodes.findOne({ code: linkCode })
    .populate('userId')
    .exec((mongoErr, linkingDocument) => {
        if (mongoErr)
            return cbk(mongoErr);

        if (!linkingDocument) {
            //return res.json({ success: false, message: `The requested link code ${linkCode} is invalid.` }).send(); // 404
            return res.json({ success: false, status: 404 }).send(); 
        }

        let oldUser = linkingDocument.userId;
        //if (oldUser.id == newUser.id)
        //    return res.json({ success: false, message: `A user cannot link back to itself` }).send();

        // Validate that the newUser does not have the same platform in the social_ids dictionary with a different social_id, or else block the process and quit with a 409 error

        if (newUser.social_ids && oldUser.social_ids) {
            const newUserSocialPlatforms = _.keys(newUser.social_ids);
            const oldUserSocialPlatforms = _.keys(oldUser.social_ids);

            if (_.intersection(newUserSocialPlatforms, oldUserSocialPlatforms).length > 0)
                return res.json({ success: false, status: 409 }).send(); // conflict having social ids for the same social platform(s) between the 2 linking user accounts
        }

        async.parallel([
            (innerCbk) => {
                if (oldUser.id == newUser.id) {
                    return async.setImmediate(() => { innerCbk(null); });
                }
                else {
                    newUser.deletedAt = new Date();
                    newUser.deletionReason = `Switched to linked user account id ${oldUser.id}`;
                    return newUser.save(innerCbk);
                }
            },
            (innerCbk) => {
                if (newUser.social_ids) {
                    _.assign(oldUser.social_ids, newUser.social_ids);
                    return User.findOneAndUpdate({ _id: oldUser._id }, { $set: { social_ids: oldUser.social_ids } }, innerCbk);
                }
                else
                    return async.setImmediate(() => { innerCbk(null); });
            }
            //,(innerCbk) => {
            //    return linkingDocument.remove(innerCbk);
            //}
        ], (parallelErr) => {
            if (parallelErr) {
                logger.log('error', parallelErr.stack);
                return res.json({ success: false, status: 500 });
            }

            User.findOne({ _id: oldUser._id, deletedAt: null })
                .populate({
                    path: 'favoriteteams',
                    select: 'name',
                    model: 'teams'
                })
                .exec(function (err, user) {
                    if (err) {
                        logger.log('error', err.stack);
                        return res.json({ success: false, status: 500 });
                    }

                    // Sign a new token and return the old User
                    const userObj = user.toObject();
                    var token = jsonwebtoken.sign({ id: user.id }, app.get('superSecret'), {
                        expiresIn: 1440 * 60 // expires in 24 hours
                    });

                    delete userObj.rankingStats;
                    userObj.server_time = moment.utc().format();
                    userObj.token = token;

                    var response = {
                        success: true,
                        data: userObj,
                        status: 200
                    };

                    return res.json(response).send();
                });
        });
    });
});



// change username
apiRoutes.put('/v1/users/update/username', jwtMiddle, (req, res) => {
    if (!req.body.username || req.body.username == '')
        return res.json({ success: false, message: 'Bad request, username is missing' });

    if (req.body.username == req.decode.username)
        return res.json({ success: true });

    var sanitizedUsername = req.body.username.replace(/[&\/\\#,+()$~ %.'":*?<>{}]/g, '_');

    User.findOne({ username: sanitizedUsername, deletedAt: null }, (err, user) => {
        if (err) {
            logger.log('error', err.stack, req.body);
            return res.json({ success: false });
        }

        if (!user) {
            async.waterfall([
                (cbk) => {
                    return User.findOneAndUpdate({ _id: req.decode._id, deletedAt: null }, { $set: { username: sanitizedUsername } }, cbk);
                },
                (userBeforeUpdate, cbk) => {
                    return Scores.update({ user_name: userBeforeUpdate.username }, { user_name: sanitizedUsername }, { multi: true }, cbk);
                }
            ], (err, parallelResult) => {
                if (err) {
                    logger.log('error', err.stack, req.body);
                    return res.json({ success: false });
                }

                return res.json({ success: true });
            });
        } else {
            return res.json({ success: false, message: 'The username exists already' });
        }
    });
});




//Get user messages
apiRoutes.get('/v1/users/update/achievements/:recalculate', function (req, res) {
    var recalc = req.params.recalculate;
    Achievements.find({}, function (err, achievs) {
        var achievsCount = achievs.length;

        _.each(achievs, function (achievement) {
            User.update({ 'achievements._id': achievement._id, deletedAt: null }, { $set: { 'achievements.$.icon': achievement.icon, 'achievements.$.text': achievement.text, 'achievements.$.title': achievement.title, 'achievements.$.total': achievement.total, 'achievements.$.value': achievement.value } }, { multi: true }, function (err) {
                User.update({ 'achievements._id': { '$ne': achievement._id }, deletedAt: null }, { $addToSet: { 'achievements': achievement } }, { multi: true }, function (err) {
                    achievsCount--;
                    if (achievsCount == 0)
                        recalculate();
                });
            });
        })
        if (err) {
            return res.status(500).send(err);
        } else {
            return res.send({ success: true });
        }
    })

    function recalculate() {

        if (recalc == "true") {
            console.log("Recalculating: " + req.params.recalculate);
            User.find({ deletedAt: null}, function (err, allUsers) {
                _.each(allUsers, function (eachUser) {
                    var total = _.sumBy(eachUser.achievements, function (o) {
                        return _.multiply(o.total, o.value);
                    });

                    var has = _.sumBy(eachUser.achievements, function (o) {
                        if (o.has == o.total) o.completed = true; else o.completed = false;
                        return _.multiply(o.has, o.value);
                    });


                    eachUser.level = has / total;
                    eachUser.save(function (err, result) { });
                })
            })
        }
    }


});

// Search users abses on string and return list of mini user objects
apiRoutes.get('/v1/users/search/:val', function (req, res) {
    User.find({ $or: [{ "username": { "$regex": req.params.val, "$options": "i" } }, { "email": { "$regex": req.params.val, "$options": "i" } }], deletedAt: null })
        .select('username email')
        .limit(20)
        .exec(function (err, docs) {
            res.send(docs);
        })
});

//Sends message to routers
apiRoutes.post('/v1/users/messages', function (req, res) {

    return MessagingTools.SendMessageToInbox(req.body, function (err, data) {
        if (!err)
            return res.send(data);
        else {
            logger.log('error', err.stack, req.body);
            return res.sendStatus(500).send(err);
        }
    })

});

//Get user messages
apiRoutes.get('/v1/users/:id/messages', function (req, res) {

    var q = User.findById(req.params.id);
    q.populate('inbox', '-recipients');

    q.exec(function (err, user) {
        if (!err) {
            res.status(200).send(user.inbox);

            user.unread = 0;
            user.save(function (err, result) {
                if (err) console.log(err);
            });
        } else
            res.status(500).send(err);
    })
});

// Delete message from user
apiRoutes.delete('/v1/users/:id/messages/:mid', function (req, res) {

    var q = User.findById(req.params.id);

    q.exec(function (err, user) {
        if (!err) {

            user.inbox = _.without(user.inbox, req.params.mid);
            // res.status(200).send(user.inbox);

            user.unread = 0;
            user.save(function (err, result) {
                if (err) console.log(err);
                res.status(200).send(user.inbox);
            });
        } else {
            logger.log('error', err.stack, req.body);
            res.status(500).send(err);
        }
    })
});

//Get user messages
apiRoutes.get('/v1/users/:id/unread', function (req, res) {

    var q = User.findById(req.params.id);
    q.select('unread');
    q.exec(function (err, result) {
        // console.log(unreadCount);
        if (!err) {
            res.status(200).send({ "unread": result.unread });
        } else
            res.status(500).send(err);
    })
});

// tools.SendMessageToInbox = function (msgData, callback) {

//     //First create the message and save the instance in database
//     var newMessage = new Message(msgData);

//     // TODO: Maybe we should remove recipients property from model to save wasted space
//     if (msgData.message)
//         newMessage.save(function (err, message) {

//             if (err) callback(err);
//             else {
//                 var querry = {};
//                 if (msgData.recipients) querry._id = { $in: msgData.recipients };
//                 // if (msgData.id) querry._id = msgData.id;

//                 User.update(querry,
//                     { $push: { inbox: message._id }, $inc: { unread: 1 } },
//                     { safe: true, new: true, multi: true },
//                     function (err, model) {

//                         // Send web sockets notice
//                         if (msgData.sockets) {
//                             app.PublishChannel.publish("socketServers", JSON.stringify({
//                                 sockets: true,
//                                 clients: msgData.recipients,
//                                 payload: {
//                                     type: "Message",
//                                     data: {
//                                         message: { "en": "You have a new message in your inbox." }
//                                     }
//                                 }
//                             }));
//                         }

//                         // TODO: Send Push Notification
//                         if (msgData.push) {
//                             MessagingTools.sendPushToUsers(msgData.recipients, msgData.msg, msgData.data, "new_message");
//                         }

//                         callback(err, model);
//                     }
//                 );




//             }
//         });

// }


// This is a route used by clients to set the eligility of the user for match prizes 
// apiRoutes.get('/v1/users/:uid/match/:mid/prizeseligible/:prelbool', jwtMiddle, function (req, res) {
apiRoutes.get('/v1/users/:uid/match/:mid/prizeseligible/:prelbool', function (req, res) {
    Scores.findOne({ game_id: req.params.mid, user_id: req.params.uid }, function (err, scoreEntry) {
        if (scoreEntry) {
            scoreEntry.prize_eligible = req.params.prelbool;
            scoreEntry.save(function (err, result) {
                res.send(result);
            })
        }
        else
            res.status(200).send();
    });

});

// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// @@ 
// @@   User Taunts

// This is a route used by clients to taunt other users 
apiRoutes.get('/v1/taunts', function (req, res) {
    mongoose.models.taunts.find({}, function (err, result) {
        if (!err) {
            res.send(result);
        }
        else {
            logger.log('error', err.stack, req.body);
            res.status(500).send(err);
        }
    });
});

// This is a route used by clients to taunt other users 
apiRoutes.post('/v1/users/:uid/taunt', function (req, res) {
    var tauntData = req.body;

    if (!tauntData.sender._id || !tauntData.recipient._id)
        return res.status(400).send("Sender and/or recipient is missing.");

    var q = User.findById(req.params.uid);
    q.exec(function (err, result) {
        if (!err) {

            var exists = _.find(result.blockedusers, function (o) {
                return o === tauntData.sender._id;
            });

            // Check first if the user is blocked
            if (exists)
                return res.status(500).send("The user has blocked your taunts");
            else {
                var usertaunt = mongoose.models.usertaunts(tauntData);

                usertaunt.save(function (err, result) {
                    if (!err) {
                        MessagingTools.SendTauntToUser(tauntData);
                        res.send(result);
                    }
                    else
                        res.status(500).send(err);
                })
            }
        }
        else {
            logger.log('error', err.stack, req.body);
            res.status(500).send(err);
        }
    });
});

apiRoutes.get('/v1/users/:uid/block/:buid/:state', function (req, res) {
    var q = User.findById(req.params.uid);

    q.exec(function (err, result) {
        if (!err) {

            // if set block to true
            if (req.params.state === "true") {
                var exists = _.find(result.blockedusers, function (o) {
                    return o === req.params.buid;
                });
                if (exists)
                    return res.status(500).send("User already blocked");
                else
                    result.blockedusers.push(req.params.buid);
            } else {
                result.blockedusers = _.without(result.blockedusers, req.params.buid);
            }

            result.save(function (err, result) {

                if (!err)
                    return res.send({ "blocked": req.params.state })
                else
                    return res.status(500).send(err);
            })


        } else
            res.status(500).send(err);
    })



});


// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// @@ 
// @@   User Subscriptions

//Get user subscription
apiRoutes.get('/v1/users/:id/subscription', function (req, res) {

    var q = Subscriptions.find({ userid: req.params.id });
    q.exec(function (err, result) {
        // console.log(unreadCount);
        if (!err) {
            res.status(200).send({ result });
        } else
            res.status(500).send(err);
    })
});

// Insert / Update user subscription
apiRoutes.post('/v1/users/:id/subscription', function (req, res) {

    var q = Subscriptions.findAndUpdate({ userid: req.params.id, receiptid: req.body.receiptid }, req.body, { upsert: true, new: true });
    q.exec(function (err, result) {
        // console.log(unreadCount);
        if (!err) {
            res.status(200).send({ result });
        } else
            res.status(500).send(err);
    })
});




// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// @@ 
// @@   User Activities

apiRoutes.get('/v1/users/activity/:matchid', function (req, res) {

    UserActivities.find({ room: req.params.matchid })
        .populate('user')
        // .populate('away_team', 'name logo')
        .exec(function (err, users) {
            // console.log(req.params.matchid);
            res.send(users);
        });
});


apiRoutes.get('/v1/users/:uid/stats', function (req, res) {
    var stats = {};
    User.findById(req.params.uid)
        .select("username picture level stats achievements rankingStats isOnline")
        .populate({
            path: 'rankingStats.bestRankMatch',
            select: 'home_team away_team home_score away_score start',
            model: 'scheduled_matches',
            populate: {
                path: 'home_team away_team',
                model: 'teams',
                select: 'name logo'
            }
        })
        .exec(function (err, result) {
            if (err)
                return res.status(500).send(err);

            if (!result)
                return res.status(500).send("User not found in database");

            stats.user = result;

            Scores.find({ user_id: req.params.uid, score: { $gt: 0 } })
                .sort({ score: -1 })
                .populate({
                    path: 'game_id',
                    model: 'scheduled_matches',
                    select: 'home_team away_team home_score away_score start',
                    populate: {
                        path: 'home_team away_team',
                        model: 'teams',
                        select: 'name logo'
                    }
                })
                .limit(1)
                .exec(function (err, bestscore) {
                    if (!err && bestscore[0]) {
                        stats.user.rankingStats.bestScoreMatch = bestscore[0].game_id;
                        stats.user.rankingStats.bestScore = bestscore[0].score;
                    }

                    Scores.find({ user_id: req.params.uid, score: { $gt: 0 } })
                        .limit(5)
                        .sort({ lastActive: -1 })
                        // .populate('away_team', 'name logo')
                        .exec(function (err, scores) {
                            if (err)
                                return res.status(500).send(err);

                            stats.lastmatches = _.map(scores, 'score');

                            var sum = 0;
                            var count = 0;
                            for (var i = 0; i < stats.lastmatches.length; ++i) {
                                sum += stats.lastmatches[i];
                                ++count;
                            }
                            var avg = Math.round(sum / count);
                            stats.pointsPerGame = avg || 0;

                            UserActivities.aggregate({ $match: {} },
                                {
                                    $group: {
                                        _id: null,
                                        cardsPlayed: { $sum: "$cardsPlayed" },
                                        cardsWon: { $sum: "$cardsWon" },
                                        overallCardsPlayed: { $sum: "$overallCardsPlayed" },
                                        overallCardsWon: { $sum: "$overallCardsWon" },
                                        instantCardsPlayed: { $sum: "$instantCardsPlayed" },
                                        instantCardsWon: { $sum: "$instantCardsWon" },
                                        presetinstantCardsPlayed: { $sum: "$presetinstantCardsPlayed" },
                                        presetinstantCardsWon: { $sum: "$presetinstantCardsWon" }
                                    }
                                }, function (err, result) {
                                    if (err)
                                        return res.status(500).send(err);

                                    stats.all = result[0];
                                    delete stats.all._id;


                                    stats.all.successPercent = (stats.all.cardsWon / stats.all.cardsPlayed) * 100 || 0;
                                    stats.all.overallSuccessPercent = (stats.all.overallCardsWon / stats.all.overallCardsPlayed) * 100 || 0;
                                    stats.all.instantSuccessPercent = (((stats.all.instantCardsWon + stats.all.presetinstantCardsWon) / (stats.all.instantCardsPlayed + stats.all.presetinstantCardsPlayed)) * 100) || 0;
                                    res.status(200).send(stats);
                                });
                        });
                })
        })



});


// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// @@ 
// @@   User Segmentation / Targeting

apiRoutes.get('/v1/users/segments/countries', function (req, res) {
    User.aggregate([
        { $match: { country: { $exists: true, $ne: null, $ne: '' } } },
        {
            $group: {
                _id: '$country'
            }
        }
    ], function (err, result) {
        if (err) {
            return res.status(500).send(err);
        }


        var countries = _.sortBy(_.map(result, '_id'));
        return res.status(200).json(countries);
    });
});


apiRoutes.get('/v1/users/segments/matches', function (req, res) {
    const now = new Date();
    const afterThreshold = moment.utc(now).subtract(1, 'y').toDate();

    mongoose.models.scheduled_matches
        .find({ start: { $gt: afterThreshold }, disabled: false }, '_id start name ')
        .populate('home_team away_team', 'name.en')
        .sort({ start: -1 })
        .exec(function (err, matches) {
        if (err) {
            return res.status(500).send(err);
        }

        const matchesDto = _.map(matches, (m) => {
            if (m.name)
                return { id: m.id, name: m.name, start: m.start };
            else {
                let name = 'Home team';
                if (m.home_team && m.home_team.name && m.home_team.name.en)
                    name = m.home_team.name.en;
                name += ' - ';
                if (m.away_team && m.away_team.name && m.away_team.name.en)
                    name += m.away_team.name.en;
                else
                    name += 'Away team';
                return {
                    id: m.id,
                    name: name,
                    start: m.start
                };
            }
        });
        return res.status(200).json(matchesDto);
    });
});

/* 
 Sample body:
 [
  {
    "segment": "Country",
    "selection": [
      "gr",
      "eg"
    ]
  }
 ]
*/
apiRoutes.post('/v1/users/segments', function (req, res) {
    let query = {};
    if (!_.isArray(req.body))
        return res.status(400).json({ error: 'Malformed body request' });

    const validSegments = ['Country', 'Online', 'Card'];

    const hasValidSegments = _.some(req.body, (item) => { return item.segment && _.indexOf(validSegments, item.segment) > -1; });
    if (!hasValidSegments)
        return res.status(400).json({ error: 'Invalid body request' });

    const hasOnlineSegment = _.some(req.body, (item) => { return item.segment && item.segment == 'Online'; });
    const hasMatchCardPlayed = _.some(req.body, (item) => { return item.segment && item.segment == 'Card'; });

    let matchesWithUserCards = [];
    let onlineUserIds = [];
    let playedCardUserIds = [];

    req.body.forEach((item) => {
        if (!item.segment)
            return;
        if (item.segment == 'Country') {
            if (item.selection) {
                query.country = { $in: _.map(item.selection, _.toUpper) }
            }
        } else if (item.segment == 'Online') {
            
        } else if (item.segment == 'Card') {
            matchesWithUserCards = _.concat(matchesWithUserCards, item.selection);
        }
    });


    async.series([
        (cbk) => {
            if (!hasOnlineSegment)
                return async.setImmediate(() => { cbk(null); });

            return UserActivities.find({ isPresent: true }, '_id user')
                .exec((err, activities) => {
                    if (err)
                        return cbk(err);

                    onlineUserIds = _.map(activities, 'user');
                    if (!query._id)
                        query._id = { };
                    if (!query._id['$in'])
                        query._id['$in'] = _.map(onlineUserIds, (id) => { return new ObjectId(id); });
                    else
                        query._id['$in'] = _.intersection(query._id['$in'], _.map(onlineUserIds, (id) => { return new ObjectId(id); }));
                    return cbk(null);
                });
        },
        (cbk) => {
            if (!hasMatchCardPlayed)
                return async.setImmediate(() => { cbk(null); });

            return UserActivities.find({ room: { $in: matchesWithUserCards }, cardsPlayed: { $gte: 1 } }, '_id user')
                .exec((err, activities) => {
                    if (err)
                        return cbk(err);

                    playedCardUserIds = _.map(activities, 'user');
                    if (!query._id)
                        query._id = {};
                    if (!query._id['$in'])
                        query._id['$in'] = _.map(playedCardUserIds, (id) => { return new ObjectId(id); });
                    else
                        query._id['$in'] = _.intersection(query._id['$in'], _.map(playedCardUserIds, (id) => { return new ObjectId(id); }));

                    return cbk(null);
                });
        },
        (cbk) => {
            User.find(query, '_id username email isOnline country pushToken cutomerType subscriptionEnd', (err, users) => {
                if (err)
                    return res.status(500).json(err);

                const userDtos = _.map(users, (u) => { return u.toObject(); });
                return res.status(200).json(userDtos);
            });
        }
    ]);
});



/* =========================
    * -----------------------------------
    *   PUSH ENDPOINTS
    * -----------------------------------
    =========================*/

/**
 * @api {post} api/tests/push/:token Send  push to Token
 * @apiName SendPush
 * @apiGroup Pushes
 * @apiVersion 0.0.1
 * @apiParam [String] tokens    The tokens list for the devices to push the message
 * @apiParam [String] messages  {"language":"message"}
 * @apiParam [String] data      data payload for the notification
 *
 *
 */

apiRoutes.post('/v1/users/push', function (req, res) {
    console.log("Push request received");
    /*
    *   NotificationMessage can be multilingual in the form of
    *   {
    *      "en": ENGLISH_MESSAGE,
    *      "ru": RUSIAN_MESSAGE
    *   }
    */
    var PushRequest = {
        message: req.body.message,
        data: req.body.data,
        ids: req.body.ids,
        application: req.body.application
    }
    return MessagingTools.sendPushToUsers(PushRequest.ids, PushRequest.message, PushRequest.data, "all", res);
    // return res.status(200).send(JSON.stringify(PushRequest));
});



// apply the routes to our application with the prefix /api
app.use('/', apiRoutes);