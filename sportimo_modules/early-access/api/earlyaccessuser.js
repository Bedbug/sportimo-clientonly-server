// Module dependencies.
var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    eau = mongoose.models.earlyAccessUser,
    shortid = require('shortid'),
    nodemailer = require('nodemailer'),
    smtpTransport = require('nodemailer-smtp-transport'),
    needle = require('needle'),
    _ = require('lodash'),
    logger = require('winston'),
    api = {};

shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$@');

/*
========= [ CORE METHODS ] =========
*/
api.getAll = function (req, res) {
    var q = eau.find();
    q.sort({ "createdAt": -1 });
    q.exec(function (err, result) {
        if (!err)
            return res.send(result);
        else
            return res.status(500).send(err);
    });
};


// POST
api.addentry = function (req, res) {
    if (!req.body.email)
        return res.status(400).send("Email is mandatory. It is the only way to reach you.");

    // Create the entry model
    var entry = new eau(req.body);

    // Create the unique code
    entry.code = shortid.generate();

    entry.save(function (err, result) {
        if (!err)
            return res.send(result);
        else {
            logger.log('error', err.stack, req.body);
            return res.status(500).send(err);
        }
    });
};

// DELETE
api.deleteentry = function (req, res) {
    return eau.findByIdAndRemove(req.params.eauid, function (err, entry) {        
        if (err) {
            logger.log('error', err.stack, req.body);
            return res.status(500).send(err);
        }
        return res.send('Delete ' + req.params.eauid + ': Done');        
    });
};

/*
========= [ UTILITY METHODS ] =========
*/

api.consumecode = function (req, res) {
    var code = req.body.code;

    if (code == "bbug")
        return res.send("Code consumed successfully. Welcome to the Early Access!");

    if (!code)
        return res.status(400).send("The code propery is mandatory.");

    eau.findOne({ code: code }, function (err, result) {

        if (!result)
            return res.status(404).send("Code not found.");

        if (result.verified)
            return res.status(422).send("This Code has already been consumed.");

        result.verified = true;

        result.save(function (e, r) {
            if (e) {
                logger.log('error', e.stack, req.body);
            }
            return res.send("Code consumed successfully. Welcome to the Early Access!");
        });

    })
}

api.verifyCode = function (req, res) {
    var code = req.body.code;

    if (code == "bbug")
        return res.send("Code found. Proceed to Early Access.");

    if (!code)
        return res.status(400).send("The code propery is mandatory.");

    eau.findOne({ code: code }, function (err, result) {
        if (err) {
            logger.log('error', err.stack, req.body);
        }
        if (!result)
            return res.status(404).send("Code not found. Access Denied.");

        if (result.verified)
            return res.send("Code found. Proceed to Early Access.");

        return res.send("Code found but is not verified.");
    })
}

api.sendEmail = function (req, res) {

    if (!Array.isArray(req.body)) return res.status(400).send("Request body is not an array as it should.")

    var CodeEmails = req.body;
    var failedUsers = [];
    _.each(CodeEmails, function (emailToSend) {
        if (!emailToSend._id || !emailToSend.email || !emailToSend.code) {
            failedUsers.push(emailToSend);
            return;
        };
        var mailOptions = {
            from: 'info@sportimo.com', // sender address
            to: emailToSend.email, // list of receivers
            subject: 'Welcome to SPORTIMO!', // Subject line
            html: '<!doctype html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><!-- NAME: MEMBER WELCOME --><!--[if gte mso 15]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]--><meta charset="UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="viewport" content="width=device-width, initial-scale=1"><title>*|MC:SUBJECT|*</title><style type="text/css">p {margin: 10px 0;padding: 0;}table {border-collapse: collapse;}h1,h2,h3,h4,h5,h6 {display: block;margin: 0;padding: 0;}img,a img {border: 0;height: auto;outline: none;text-decoration: none;}body,#bodyTable,#bodyCell {height: 100%;margin: 0;padding: 0;width: 100%;}#outlook a {padding: 0;}img {-ms-interpolation-mode: bicubic;}table {mso-table-lspace: 0pt;mso-table-rspace: 0pt;}.ReadMsgBody {width: 100%;}.ExternalClass {width: 100%;}p,a,li,td,blockquote {mso-line-height-rule: exactly;}a[href^=tel],a[href^=sms] {color: inherit;cursor: default;text-decoration: none;}p,a,li,td,body,table,blockquote {-ms-text-size-adjust: 100%;-webkit-text-size-adjust: 100%;}.ExternalClass,.ExternalClass p,.ExternalClass td,.ExternalClass div,.ExternalClass span,.ExternalClass font {line-height: 100%;}a[x-apple-data-detectors] {color: inherit !important;text-decoration: none !important;font-size: inherit !important;font-family: inherit !important;font-weight: inherit !important;line-height: inherit !important;}.templateContainer {max-width: 600px !important;}a.mcnButton {display: block;}.mcnImage {vertical-align: bottom;}.mcnTextContent {word-break: break-word;}.mcnTextContent img {height: auto !important;}.mcnDividerBlock {table-layout: fixed !important;}/*@tab Page@section Background Style@tip Set the background color and top border for your email. You may want to choose colors that match your company\'s branding.*/body,#bodyTable {/*@editable*/background-color: #ffffff;}/*@tab Page@section Background Style@tip Set the background color and top border for your email. You may want to choose colors that match your company\'s branding.*/#bodyCell {/*@editable*/border-top: 0;}/*@tab Page@section Heading 1@tip Set the styling for all first-level headings in your emails. These should be the largest of your headings.@style heading 1*/h1 {/*@editable*/color: #38433d;/*@editable*/font-family: \'Open Sans\', \'Helvetica Neue\', Helvetica, Arial, sans-serif;/*@editable*/font-size: 30px;/*@editable*/font-style: normal;/*@editable*/font-weight: normal;/*@editable*/line-height: 125%;/*@editable*/letter-spacing: normal;/*@editable*/text-align: right;}/*@tab Page@section Heading 2@tip Set the styling for all second-level headings in your emails.@style heading 2*/h2 {/*@editable*/color: #202020;/*@editable*/font-family: Helvetica;/*@editable*/font-size: 24px;/*@editable*/font-style: normal;/*@editable*/font-weight: bold;/*@editable*/line-height: 150%;/*@editable*/letter-spacing: normal;/*@editable*/text-align: center;}/*@tab Page@section Heading 3@tip Set the styling for all third-level headings in your emails.@style heading 3*/h3 {/*@editable*/color: #989898;/*@editable*/font-family: Helvetica;/*@editable*/font-size: 24px;/*@editable*/font-style: normal;/*@editable*/font-weight: bold;/*@editable*/line-height: 150%;/*@editable*/letter-spacing: normal;/*@editable*/text-align: center;}/*@tab Page@section Heading 4@tip Set the styling for all fourth-level headings in your emails. These should be the smallest of your headings.@style heading 4*/h4 {/*@editable*/color: #202020;/*@editable*/font-family: Helvetica;/*@editable*/font-size: 18px;/*@editable*/font-style: normal;/*@editable*/font-weight: bold;/*@editable*/line-height: 200%;/*@editable*/letter-spacing: normal;/*@editable*/text-align: center;}/*@tab Preheader@section Preheader Style@tip Set the background color and borders for your email\'s preheader area.*/#templatePreheader {/*@editable*/background-color: #FFFFFF;/*@editable*/background-image: none;/*@editable*/background-repeat: no-repeat;/*@editable*/background-position: center;/*@editable*/background-size: cover;/*@editable*/border-top: 0;/*@editable*/border-bottom: 0;/*@editable*/padding-top: 9px;/*@editable*/padding-bottom: 9px;}/*@tab Preheader@section Preheader Text@tip Set the styling for your email\'s preheader text. Choose a size and color that is easy to read.*/#templatePreheader .mcnTextContent,#templatePreheader .mcnTextContent p {/*@editable*/color: #656565;/*@editable*/font-family: Helvetica;/*@editable*/font-size: 12px;/*@editable*/line-height: 150%;/*@editable*/text-align: left;}/*@tab Preheader@section Preheader Link@tip Set the styling for your email\'s preheader links. Choose a color that helps them stand out from your text.*/#templatePreheader .mcnTextContent a,#templatePreheader .mcnTextContent p a {/*@editable*/color: #656565;/*@editable*/font-weight: normal;/*@editable*/text-decoration: underline;}/*@tab Header@section Header Style@tip Set the background color and borders for your email\'s header area.*/#templateHeader {/*@editable*/background-color: #ffffff;/*@editable*/background-image: none;/*@editable*/background-repeat: no-repeat;/*@editable*/background-position: center;/*@editable*/background-size: auto;/*@editable*/border-top: 0;/*@editable*/border-bottom: 0;/*@editable*/padding-top: 0px;/*@editable*/padding-bottom: 0px;}/*@tab Header@section Header Text@tip Set the styling for your email\'s header text. Choose a size and color that is easy to read.*/#templateHeader .mcnTextContent,#templateHeader .mcnTextContent p {/*@editable*/color: #202020;/*@editable*/font-family: Helvetica;/*@editable*/font-size: 18px;/*@editable*/line-height: 100%;/*@editable*/text-align: left;}/*@tab Header@section Header Link@tip Set the styling for your email\'s header links. Choose a color that helps them stand out from your text.*/#templateHeader .mcnTextContent a,#templateHeader .mcnTextContent p a {/*@editable*/color: #202020;/*@editable*/font-weight: normal;/*@editable*/text-decoration: underline;}/*@tab Body@section Body Style@tip Set the background color and borders for your email\'s body area.*/#templateBody {/*@editable*/background-color: #ffffff;/*@editable*/background-image: none;/*@editable*/background-repeat: no-repeat;/*@editable*/background-position: center;/*@editable*/background-size: cover;/*@editable*/border-top: 0;/*@editable*/border-bottom: 0;/*@editable*/padding-top: 50px;/*@editable*/padding-bottom: 25px;}/*@tab Body@section Body Text@tip Set the styling for your email\'s body text. Choose a size and color that is easy to read.*/#templateBody .mcnTextContent,#templateBody .mcnTextContent p {/*@editable*/color: #666666;/*@editable*/font-family: Georgia;/*@editable*/font-size: 16px;/*@editable*/line-height: 150%;/*@editable*/text-align: center;}/*@tab Body@section Body Link@tip Set the styling for your email\'s body links. Choose a color that helps them stand out from your text.*/#templateBody .mcnTextContent a,#templateBody .mcnTextContent p a {/*@editable*/color: #999999;/*@editable*/font-weight: normal;/*@editable*/text-decoration: underline;}/*@tab Columns@section Column Style@tip Set the background color and borders for your email\'s columns.*/#templateColumns {/*@editable*/background-color: #transparent;/*@editable*/background-image: none;/*@editable*/background-repeat: no-repeat;/*@editable*/background-position: center;/*@editable*/background-size: cover;/*@editable*/border-top: 0;/*@editable*/border-bottom: 0;/*@editable*/padding-top: 0px;/*@editable*/padding-bottom: 0px;}/*@tab Columns@section Column Text@tip Set the styling for your email\'s column text. Choose a size and color that is easy to read.*/#templateColumns .columnContainer .mcnTextContent,#templateColumns .columnContainer .mcnTextContent p {/*@editable*/color: #000000;/*@editable*/font-family: Helvetica;/*@editable*/font-size: 0px;/*@editable*/line-height: 100%;/*@editable*/text-align: center;}/*@tab Columns@section Column Link@tip Set the styling for your email\'s column links. Choose a color that helps them stand out from your text.*/#templateColumns .columnContainer .mcnTextContent a,#templateColumns .columnContainer .mcnTextContent p a {/*@editable*/color: #202020;/*@editable*/font-weight: normal;/*@editable*/text-decoration: none;}/*@tab Footer@section Footer Style@tip Set the background color and borders for your email\'s footer area.*/#templateFooter {/*@editable*/background-color: #38433d;/*@editable*/background-image: none;/*@editable*/background-repeat: no-repeat;/*@editable*/background-position: center;/*@editable*/background-size: cover;/*@editable*/border-top: 0;/*@editable*/border-bottom: 0;/*@editable*/padding-top: 20px;/*@editable*/padding-bottom: 20px;}/*@tab Footer@section Footer Text@tip Set the styling for your email\'s footer text. Choose a size and color that is easy to read.*/#templateFooter .mcnTextContent,#templateFooter .mcnTextContent p {/*@editable*/color: #FFFFFF;/*@editable*/font-family: Helvetica;/*@editable*/font-size: 12px;/*@editable*/line-height: 150%;/*@editable*/text-align: center;}/*@tab Footer@section Footer Link@tip Set the styling for your email\'s footer links. Choose a color that helps them stand out from your text.*/#templateFooter .mcnTextContent a,#templateFooter .mcnTextContent p a {/*@editable*/color: #FFFFFF;/*@editable*/font-weight: normal;/*@editable*/text-decoration: underline;}@media only screen and (min-width:768px) {.templateContainer {width: 600px !important;}}@media only screen and (max-width: 480px) {body,table,td,p,a,li,blockquote {-webkit-text-size-adjust: none !important;}}@media only screen and (max-width: 480px) {body {width: 100% !important;min-width: 100% !important;}}@media only screen and (max-width: 480px) {.columnWrapper {max-width: 100% !important;width: 100% !important;}}@media only screen and (max-width: 480px) {.mcnImage {width: 100% !important;}}@media only screen and (max-width: 480px) {.mcnCartContainer,.mcnCaptionTopContent,.mcnRecContentContainer,.mcnCaptionBottomContent,.mcnTextContentContainer,.mcnBoxedTextContentContainer,.mcnImageGroupContentContainer,.mcnCaptionLeftTextContentContainer,.mcnCaptionRightTextContentContainer,.mcnCaptionLeftImageContentContainer,.mcnCaptionRightImageContentContainer,.mcnImageCardLeftTextContentContainer,.mcnImageCardRightTextContentContainer {max-width: 100% !important;width: 100% !important;}}@media only screen and (max-width: 480px) {.mcnBoxedTextContentContainer {min-width: 100% !important;}}@media only screen and (max-width: 480px) {.mcnImageGroupContent {padding: 9px !important;}}@media only screen and (max-width: 480px) {.mcnCaptionLeftContentOuter .mcnTextContent,.mcnCaptionRightContentOuter .mcnTextContent {padding-top: 9px !important;}}@media only screen and (max-width: 480px) {.mcnImageCardTopImageContent,.mcnCaptionBlockInner .mcnCaptionTopContent:last-child .mcnTextContent {padding-top: 18px !important;}}@media only screen and (max-width: 480px) {.mcnImageCardBottomImageContent {padding-bottom: 9px !important;}}@media only screen and (max-width: 480px) {.mcnImageGroupBlockInner {padding-top: 0 !important;padding-bottom: 0 !important;}}@media only screen and (max-width: 480px) {.mcnImageGroupBlockOuter {padding-top: 9px !important;padding-bottom: 9px !important;}}@media only screen and (max-width: 480px) {.mcnTextContent,.mcnBoxedTextContentColumn {padding-right: 18px !important;padding-left: 18px !important;}}@media only screen and (max-width: 480px) {.mcnImageCardLeftImageContent,.mcnImageCardRightImageContent {padding-right: 18px !important;padding-bottom: 0 !important;padding-left: 18px !important;}}@media only screen and (max-width: 480px) {.mcpreview-image-uploader {display: none !important;width: 100% !important;}}@media only screen and (max-width: 480px) {/*@tab Mobile Styles@section Heading 1@tip Make the first-level headings larger in size for better readability on small screens.*/h1 {/*@editable*/font-size: 22px !important;/*@editable*/line-height: 125% !important;}}@media only screen and (max-width: 480px) {/*@tab Mobile Styles@section Heading 2@tip Make the second-level headings larger in size for better readability on small screens.*/h2 {/*@editable*/font-size: 20px !important;/*@editable*/line-height: 125% !important;}}@media only screen and (max-width: 480px) {/*@tab Mobile Styles@section Heading 3@tip Make the third-level headings larger in size for better readability on small screens.*/h3 {/*@editable*/font-size: 18px !important;/*@editable*/line-height: 125% !important;}}@media only screen and (max-width: 480px) {/*@tab Mobile Styles@section Heading 4@tip Make the fourth-level headings larger in size for better readability on small screens.*/h4 {/*@editable*/font-size: 16px !important;/*@editable*/line-height: 150% !important;}}@media only screen and (max-width: 480px) {/*@tab Mobile Styles@section Boxed Text@tip Make the boxed text larger in size for better readability on small screens. We recommend a font size of at least 16px.*/.mcnBoxedTextContentContainer .mcnTextContent,.mcnBoxedTextContentContainer .mcnTextContent p {/*@editable*/font-size: 14px !important;/*@editable*/line-height: 150% !important;}}@media only screen and (max-width: 480px) {/*@tab Mobile Styles@section Preheader Visibility@tip Set the visibility of the email\'s preheader on small screens. You can hide it to save space.*/#templatePreheader {/*@editable*/display: block !important;}}@media only screen and (max-width: 480px) {/*@tab Mobile Styles@section Preheader Text@tip Make the preheader text larger in size for better readability on small screens.*/#templatePreheader .mcnTextContent,#templatePreheader .mcnTextContent p {/*@editable*/font-size: 14px !important;/*@editable*/line-height: 150% !important;}}@media only screen and (max-width: 480px) {/*@tab Mobile Styles@section Header Text@tip Make the header text larger in size for better readability on small screens.*/#templateHeader .mcnTextContent,#templateHeader .mcnTextContent p {/*@editable*/font-size: 16px !important;/*@editable*/line-height: 150% !important;}}@media only screen and (max-width: 480px) {/*@tab Mobile Styles@section Body Text@tip Make the body text larger in size for better readability on small screens. We recommend a font size of at least 16px.*/#templateBody .mcnTextContent,#templateBody .mcnTextContent p {/*@editable*/font-size: 16px !important;/*@editable*/line-height: 150% !important;}}@media only screen and (max-width: 480px) {/*@tab Mobile Styles@section Column Text@tip Make the column text larger in size for better readability on small screens. We recommend a font size of at least 16px.*/#templateColumns .columnContainer .mcnTextContent,#templateColumns .columnContainer .mcnTextContent p {/*@editable*/font-size: 16px !important;/*@editable*/line-height: 150% !important;}}@media only screen and (max-width: 480px) {/*@tab Mobile Styles@section Footer Text@tip Make the footer content text larger in size for better readability on small screens.*/#templateFooter .mcnTextContent,#templateFooter .mcnTextContent p {/*@editable*/font-size: 14px !important;/*@editable*/line-height: 150% !important;}}</style></head><body><center><table align="center" border="0" cellpadding="0" cellspacing="0" height="100%" width="100%" id="bodyTable"><tr><td align="center" valign="top" id="bodyCell"><!-- BEGIN TEMPLATE // --><table border="0" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" valign="top" id="templatePreheader"><!--[if gte mso 9]><table align="center" border="0" cellspacing="0" cellpadding="0" width="600" style="width:600px;"><tr><td align="center" valign="top" width="600" style="width:600px;"><![endif]--><table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" class="templateContainer"><tr><td valign="top" class="preheaderContainer"><table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnTextBlock" style="min-width:100%;"><tbody class="mcnTextBlockOuter"><tr><td valign="top" class="mcnTextBlockInner" style="padding-top:9px;"><!--[if mso]><table align="left" border="0" cellspacing="0" cellpadding="0" width="100%" style="width:100%;"><tr><![endif]--><!--[if mso]><td valign="top" width="390" style="width:390px;"><![endif]--><table align="left" border="0" cellpadding="0" cellspacing="0" style="max-width:390px;" width="100%" class="mcnTextContentContainer"><tbody><tr><td valign="top" class="mcnTextContent" style="padding-top:0; padding-left:18px; padding-bottom:9px; padding-right:18px;"></td></tr></tbody></table><!--[if mso]></td><![endif]--><!--[if mso]><td valign="top" width="210" style="width:210px;"><![endif]--><table align="left" border="0" cellpadding="0" cellspacing="0" style="max-width:210px;" width="100%" class="mcnTextContentContainer"><tbody><tr><td valign="top" class="mcnTextContent" style="padding-top:0; padding-left:18px; padding-bottom:9px; padding-right:18px;"><a href="*|ARCHIVE|*" target="_blank">View this email in your browser</a></td></tr></tbody></table><!--[if mso]></td><![endif]--><!--[if mso]></tr></table><![endif]--></td></tr></tbody></table></td></tr></table><!--[if gte mso 9]></td></tr></table><![endif]--></td></tr><tr><td align="center" valign="top" id="templateHeader"><!--[if gte mso 9]><table align="center" border="0" cellspacing="0" cellpadding="0" width="600" style="width:600px;"><tr><td align="center" valign="top" width="600" style="width:600px;"><![endif]--><table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" class="templateContainer"><tr><td valign="top" class="headerContainer"><table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnImageBlock" style="min-width:100%;"><tbody class="mcnImageBlockOuter"><tr><td valign="top" style="padding:0px" class="mcnImageBlockInner"><table align="left" width="100%" border="0" cellpadding="0" cellspacing="0" class="mcnImageContentContainer" style="min-width:100%;"><tbody><tr><td class="mcnImageContent" valign="top" style="padding-right: 0px; padding-left: 0px; padding-top: 0; padding-bottom: 0; text-align:center;"><img align="center" alt="" src="https://gallery.mailchimp.com/edb5ef3c28289aa28d32465a1/images/3e2823c6-151d-4a45-8a69-fd3f6ea881cc.png"width="600" style="max-width:1024px; padding-bottom: 0; display: inline !important; vertical-align: bottom;"class="mcnImage"></td></tr></tbody></table></td></tr></tbody></table></td></tr></table><!--[if gte mso 9]></td></tr></table><![endif]--></td></tr><tr><td align="center" valign="top" id="templateBody"><!--[if gte mso 9]><table align="center" border="0" cellspacing="0" cellpadding="0" width="600" style="width:600px;"><tr><td align="center" valign="top" width="600" style="width:600px;"><![endif]--><table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" class="templateContainer"><tr><td valign="top" class="bodyContainer"><table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnTextBlock" style="min-width:100%;"><tbody class="mcnTextBlockOuter"><tr><td valign="top" class="mcnTextBlockInner" style="padding-top:9px;"><!--[if mso]><table align="left" border="0" cellspacing="0" cellpadding="0" width="100%" style="width:100%;"><tr><![endif]--><!--[if mso]><td valign="top" width="600" style="width:600px;"><![endif]--><table align="left" border="0" cellpadding="0" cellspacing="0" style="max-width:100%; min-width:100%;" width="100%" class="mcnTextContentContainer"><tbody><tr><td valign="top" class="mcnTextContent" style="padding-top:0; padding-right:18px; padding-bottom:9px; padding-left:18px;"><div style="text-align: right;"><h1 class="null"><strong>! Sportimo مرحبا بك في</strong></h1><br><span style="font-size:18px"><span style="font-family:open sans,helvetica neue,helvetica,arial,sans-serif">لأنك سجلت مبكرا ، أنت الآن من أول من يمكنهم الدخول<br><strong><span style="background-color:#FFC631">' + 
            emailToSend.code + 
            '</span>&nbsp;</strong>: رمز الدخول الخاص بك هو<br><br> !استعد لتجربة كرة قدم فريدة من نوعها<br><br><strong>!كن أكثر من مشاهد، كن لاعب</strong><br><br> Sportimo&nbsp;فريق</span></span><div>&nbsp;</div></div></td></tr></tbody></table><!--[if mso]></td><![endif]--><!--[if mso]></tr></table><![endif]--></td></tr></tbody></table><table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnDividerBlock" style="min-width:100%;"><tbody class="mcnDividerBlockOuter"><tr><td class="mcnDividerBlockInner" style="min-width: 100%; padding: 15px 18px 18px;"><table class="mcnDividerContent" border="0" cellpadding="0" cellspacing="0" width="100%" style="min-width: 100%;border-top: 2px solid #EAEAEA;"><tbody><tr><td><span></span></td></tr></tbody></table><!-- <td class="mcnDividerBlockInner" style="padding: 18px;"> <hr class="mcnDividerContent" style="border-bottom-color:none; border-left-color:none; border-right-color:none; border-bottom-width:0; border-left-width:0; border-right-width:0; margin-top:0; margin-right:0; margin-bottom:0; margin-left:0;" />--></td></tr></tbody></table><table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnTextBlock" style="min-width:100%;"><tbody class="mcnTextBlockOuter"><tr><td valign="top" class="mcnTextBlockInner" style="padding-top:9px;"><!--[if mso]><table align="left" border="0" cellspacing="0" cellpadding="0" width="100%" style="width:100%;"><tr><![endif]--><!--[if mso]><td valign="top" width="600" style="width:600px;"><![endif]--><table align="left" border="0" cellpadding="0" cellspacing="0" style="max-width:100%; min-width:100%;" width="100%" class="mcnTextContentContainer"><tbody><tr><td valign="top" class="mcnTextContent" style="padding-top:0; padding-right:18px; padding-bottom:9px; padding-left:18px;"><h1 class="null" style="text-align: left;"><strong><span style="font-size:20px"><span style="font-family:open sans,helvetica neue,helvetica,arial,sans-serif">Welcome to Sportimo!</span></span></strong></h1><h1 class="null" style="text-align: left;"><br><span style="font-family:open sans,helvetica neue,helvetica,arial,sans-serif"><span style="font-size:18px">Since you signed up early, you\'re one of the first people to get access!&nbsp;<br>Your access code is:&nbsp;&nbsp;<strong><span style="background-color:#FFC631">' +
             emailToSend.code + 
             '</span>&nbsp;</strong><br><br> Get ready for a new football experience!&nbsp;<br><br><strong>Don’t just watch, play!</strong><br><br> Team Sportimo</span></span></h1><p style="text-align: left;">&nbsp;</p></td></tr></tbody></table><!--[if mso]></td><![endif]--><!--[if mso]></tr></table><![endif]--></td></tr></tbody></table></td></tr></table><!--[if gte mso 9]></td></tr></table><![endif]--></td></tr><tr><td align="center" valign="top" id="templateColumns"><table border="0" cellpadding="0" cellspacing="0" width="100%" class="templateContainer"><tr><td valign="top"><!--[if gte mso 9]><table align="center" border="0" cellspacing="0" cellpadding="0" width="600" style="width:600px;"><tr><td align="center" valign="top" width="200" style="width:200px;"><![endif]--><table align="left" border="0" cellpadding="0" cellspacing="0" width="200" class="columnWrapper"><tr><td valign="top" class="columnContainer"></td></tr></table><!--[if gte mso 9]></td><td align="center" valign="top" width="200" style="width:200px;"><![endif]--><table align="left" border="0" cellpadding="0" cellspacing="0" width="200" class="columnWrapper"><tr><td valign="top" class="columnContainer"></td></tr></table><!--[if gte mso 9]></td><td align="center" valign="top" width="200" style="width:200px;"><![endif]--><table align="left" border="0" cellpadding="0" cellspacing="0" width="200" class="columnWrapper"><tr><td valign="top" class="columnContainer"></td></tr></table><!--[if gte mso 9]></td></tr></table><![endif]--></td></tr></table></td></tr><tr><td align="center" valign="top" id="templateFooter"><!--[if gte mso 9]><table align="center" border="0" cellspacing="0" cellpadding="0" width="600" style="width:600px;"><tr><td align="center" valign="top" width="600" style="width:600px;"><![endif]--><table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" class="templateContainer"><tr><td valign="top" class="footerContainer"><table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnTextBlock" style="min-width:100%;"><tbody class="mcnTextBlockOuter"><tr><td valign="top" class="mcnTextBlockInner" style="padding-top:9px;"><!--[if mso]><table align="left" border="0" cellspacing="0" cellpadding="0" width="100%" style="width:100%;"><tr><![endif]--><!--[if mso]><td valign="top" width="600" style="width:600px;"><![endif]--><table align="left" border="0" cellpadding="0" cellspacing="0" style="max-width:100%; min-width:100%;" width="100%" class="mcnTextContentContainer"><tbody><tr><td valign="top" class="mcnTextContent" style="padding-top:0; padding-right:18px; padding-bottom:9px; padding-left:18px;"><div style="text-align: center;">Sportimo لقد استلمت هذه الرسالة لأنك سجلت في تطبيق</div></td></tr></tbody></table><!--[if mso]></td><![endif]--><!--[if mso]></tr></table><![endif]--></td></tr></tbody></table><table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnDividerBlock" style="min-width:100%;"><tbody class="mcnDividerBlockOuter"><tr><td class="mcnDividerBlockInner" style="min-width:100%; padding:18px;"><table class="mcnDividerContent" border="0" cellpadding="0" cellspacing="0" width="100%" style="min-width: 100%;border-top: 2px solid #EAEAEA;"><tbody><tr><td><span></span></td></tr></tbody></table><!-- <td class="mcnDividerBlockInner" style="padding: 18px;"> <hr class="mcnDividerContent" style="border-bottom-color:none; border-left-color:none; border-right-color:none; border-bottom-width:0; border-left-width:0; border-right-width:0; margin-top:0; margin-right:0; margin-bottom:0; margin-left:0;" />--></td></tr></tbody></table><table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnTextBlock" style="min-width:100%;"><tbody class="mcnTextBlockOuter"><tr><td valign="top" class="mcnTextBlockInner" style="padding-top:9px;"><!--[if mso]><table align="left" border="0" cellspacing="0" cellpadding="0" width="100%" style="width:100%;"><tr><![endif]--><!--[if mso]><td valign="top" width="600" style="width:600px;"><![endif]--><table align="left" border="0" cellpadding="0" cellspacing="0" style="max-width:100%; min-width:100%;" width="100%" class="mcnTextContentContainer"><tbody><tr><td valign="top" class="mcnTextContent" style="padding-top:0; padding-right:18px; padding-bottom:9px; padding-left:18px;">You\'re receiving this because you signed up to Sportimo app</td></tr></tbody></table><!--[if mso]></td><![endif]--><!--[if mso]></tr></table><![endif]--></td></tr></tbody></table></td></tr></table><!--[if gte mso 9]></td></tr></table><![endif]--></td></tr></table><!-- // END TEMPLATE --></td></tr></table></center></body></html>'
            
        };
        api.sendEmailToUser(mailOptions, function (error, info) {
            if (error) {
                logger.log('error', error.stack, req.body);
                return console.log(error);
            }

            eau.findOneAndUpdate({ _id: emailToSend._id }, { email_sent: true }, function (e, r) {
                // console.log(e);
                // console.log(r);
            })

        });
    })

    return res.send({ failed: failedUsers });

}

var transporter = nodemailer.createTransport(smtpTransport({
    host: 'imap.gmail.com',
    secure: true,
    port: 465,
    auth: {
        user: 'aris.brink@sportimo.com',
        pass: 'Pass1234!'
    },
    tls: {
        rejectUnauthorized: false
    }
}));

api.sendEmailToUser = function (mailOptions, callback) {
    transporter.sendMail(mailOptions, function (error, info) {
        if (callback) {
            return callback(error, info);
        }
    });
}

/** Callback Helper
 * @param  {Function} - Callback Function
 * @param  {Object} - The Error Object
 * @param  {Object} - Data Object
 * @return {Function} - Callback
 */

var cbf = function (cb, err, data) {
    if (cb && typeof (cb) == 'function') {
        if (err) cb(err);
        else cb(false, data);
    }
};

/*
=====================  ROUTES  =====================
*/
router.get('/v1/early-access/', api.getAll);

router.post('/v1/early-access/', api.addentry);

router.route('/v1/early-access/:eauid')
    // 	.put(api.editentry)
    .delete(api.deleteentry);

router.post('/v1/early-access/action/sendemail', api.sendEmail);

/** The consume action allows the client to store the code and use it for access */
router.post('/v1/early-access/action/consume', api.consumecode);

/** The verify action allows the client to proceed if the code is valid */
router.post('/v1/early-access/action/verify', api.verifyCode);

module.exports = router;
