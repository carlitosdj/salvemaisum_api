
var nodemailer = require('nodemailer');

const SendMailController = (emailTo, subjectText = '', messageText = '') => {

    console.log("Sending email to: ", emailTo)

    var remetente = nodemailer.createTransport({
        // host: 'mail.salvemaisum.com.br',
        // service: 'mail.salvemaisum.com.br',
        // port: 465,
        // secure: false,
        // auth:{
        //     user: 'aplicativo@salvemaisum.com.br',
        //     pass: 'Salve1234!' 
        // }
        pool: true,
        maxConnections: 50,
        maxMessages: Infinity,
        host: 'mail.salvemaisum.com.br',
        //service: 'mail.salvemaisum.com.br',
        //port: 465,
        secure: false,
        auth:{
            user: 'aplicativo@salvemaisum.com.br',
            pass: 'Salve1234!' 
        }
    });

    
    var emailASerEnviado = {
        from: 'Salve Mais Um <aplicativo@salvemaisum.com.br>',
        to: emailTo,
        subject: subjectText,
        text: messageText,
        html: messageText,
    };

    remetente.sendMail(emailASerEnviado, function(error){
        if (error) {
            console.log(error);
        } else {
            console.log('Email enviado com sucesso =).');
        }
    });

}

export default SendMailController;