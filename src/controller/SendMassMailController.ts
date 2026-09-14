
var nodemailer = require('nodemailer');

const SendMassMailController = (list, subjectText = '', messageText = '') => {
    // console.log("Sending email to: ", list)
    
    let transporter = nodemailer.createTransport({
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

    let messages = [{}];
    list.map((usuario) => {

        let unsubscribeLink = '<a href="https://evento.violaofeeling.com.br/unsubscribe/' + usuario.list + '/' + usuario.email + '"> Cancelar inscrição </a>'  ;
        let messageUnsubscribe = 'Se você não deseja mais receber esse tipo de mensagem, clique no link a seguir: ' +  unsubscribeLink;
        messages.push({
            from: 'Salve Mais Um <aplicativo@salvemaisum.com.br>',
            to: usuario.email,
            subject: subjectText,
            text: messageText + ' ' + messageUnsubscribe,
            html: messageText + "<br/><br/>" + "<p style='font-size: 10px'>" + messageUnsubscribe + "</p>",
        }) 
    })

    transporter.on("idle", function () {
      // send next message from the pending queue
      console.log("isIdle", transporter.isIdle())
      console.log("messages", messages.length)
      while (transporter.isIdle() && messages.length) {

        // console.log("Entrei no while")
        let message = messages.shift()
        transporter.sendMail(message, (error, info) => {
            // console.log("info", info)
            if (error) {
             console.log("error", error);
            } else {
             console.log('The message was sent!', message);
            }
        })
      }

    });

    // console.log("Saí do while")
    
}

export default SendMassMailController;