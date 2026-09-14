import "reflect-metadata";
import {createConnection} from "typeorm";
import express from "express";
import * as bodyParser from "body-parser";
import {Request, Response} from "express";
import {Routes} from "./routes";
import {getConnection, getRepository, Like} from "typeorm";
import { Campaign } from "./entity/Campaign";

// import {User} from "./entity/User";
// import {Profile} from "./entity/Profile";
// import {Component} from './entity/Component';
// import {ComponentExtra} from './entity/ComponentExtra';
// import {Email} from './entity/Lead';
// import {Cart} from './entity/Cart';
// import {Emailtolist} from './entity/Emailtolist';
// import {Aulaconcluida} from './entity/Aulaconcluida';
// import {Support} from './entity/Support';
// import {Wppcamp} from './entity/Wppcamp';
// import {Wppgroup} from './entity/Wppgroup';

const schedule = require('node-schedule');
var multer = require('multer')


//let path = '../../aplicativo/public/files';
let path = '/www/wwwroot/salvemaisum.com.br/files';

var storage = multer.diskStorage({
    destination: function (req: any, file: any, cb: any) {
    cb(null, path)
  },
  filename: function (req : any, file: any, cb: any) {
    cb(null, Date.now() + '-' +file.originalname )
  }
})
var upload = multer({ storage: storage }).single('file')

createConnection().then(async connection => {
    // const cors = require('cors');
    const PORT = process.env.PORT || 8889;
    // create express app
    const app = express();
    
    
    app.use(bodyParser.json());
    app.use(express.urlencoded({ extended: false }));

    // app.use(cors({
    //     origin: true,
    //     credentials: true,
    // }));

    // Add headers
    app.use(function (req: any, res: any, next: any) {

        // Website you wish to allow to connect
        //res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5000');
        res.setHeader('Access-Control-Allow-Origin', '*');

        // Request methods you wish to allow
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

        // Request headers you wish to allow
        res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

        // Set to true if you need the website to include cookies in the requests sent
        // to the API (e.g. in case you use sessions)
        res.setHeader('Access-Control-Allow-Credentials', 'true');

        // Pass to next layer of middleware
        next();
    });


    app.post('/upload',function(req: any, res: any) {
        console.log('Upload request.')
        upload(req, res, function (err: any) {
            console.log('trying upload..')
            if (err instanceof multer.MulterError) {
                console.log(err)
                return res.status(500).json(err)
            } else if (err) {
                console.log(err)
                return res.status(500).json(err)
            }
            return res.status(200).send(req.file)
        })
    });

    

    app.get('/schedule',function(req: any, res: any) {
        let dateNow = new Date();
        let tomorrowDay = new Date(dateNow);
        tomorrowDay.setDate(dateNow.getDate() + 1);
        let nextMinute = new Date(dateNow.getTime() + 1*60000)
        

        // console.log("dateNow", dateNow)
        // console.log("Tomorrow", tomorrowDay)
        // console.log("nextMinute", nextMinute)
        console.log("NewSchedule To:", nextMinute)

        const job = schedule.scheduleJob(nextMinute, function(fireDate){
            console.log('This job was supposed to run at ' + fireDate + ', but actually ran at ' + new Date());
          });
        return res.status(200).send({scheduled: nextMinute})
    });

    const getCircularReplacer = () => {
        const seen = new WeakSet();
        return (key, value) => {
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
              return;
            }
            seen.add(value);
          }
          return value;
        };
      };

    app.get('/jobs',function(req: any, res: any) {
        const jobs = schedule
        // console.log("jobs", jobs)
        return res.status(200).send(JSON.stringify(jobs.scheduledJobs, getCircularReplacer()))
    })

    // register express routes from defined application routes
    Routes.forEach((route:any) => {
        (app as any)[route.method](route.route, (req: Request, res: Response, next: Function) => {
            const result = (new (route.controller as any))[route.action](req, res, next);
            if (result instanceof Promise) {
                result.then(result => result !== null && result !== undefined ? res.send(result) : undefined)
                .catch(e => 
                    
                    res.status(400).send({error: e.message})
                    
                );

            } else if (result !== null && result !== undefined) {
                res.json(result);
            }
        });
    });

    // setup express app here
    // ...
    app.get('/', (req, res) => {
        res.send('Servidor - Salve Mais Um')
    })

    const recebeDe = (bloodtype: string) => {
        switch (bloodtype) {
          case '1':
            return "O-" //O-
          case '2':
            return "O+, O-" //O+
          case '3':
            return "A-, O-" //A-
          case '4':
            return "A+, A-, O+, O-" //A+
          case '5':
            return "B-, O-" //B-
          case '6':
            return "B+, B-, O+, O-" //B+
          case '7':
            return "A-, B-, AB-, O-" //AB-
          case '8':
            return "A+, A-, B+, B-, AB+, AB-, O+, O-" //AB+
          default:
            return "Invalido"
        }
      }

    
    //To show at facebook and twitter
    app.get("/bot/:id", async (req, res) => {
        
        let campaignReposity = getRepository(Campaign);
        const { id } = req.params;
        let campaign = await campaignReposity.findOne(id);

        
        
        if (!id) {
          return res.status(404).send("Not found");
        }

        if(!campaign) {
            return res.status(404).send("Not found");
        }
      
        // TODO: fetch your post from database here
        const post = {
          title: 'Ajude a salvar ' + campaign.name,
          description: 'Precisa de sangue: ' + recebeDe(campaign.bloodtype) + '.',
          url: "https://salvemaisum.com.br/campaign/" + campaign.id,
          image: "https://salvemaisum.com.br/files/" + campaign.image,
        };
        //console.log("POST", post)
      
        return res.send(`
          <html>
            <head>
              <title>${post.title}</title>
              <description>${post.description}</description>
            
              <meta name="twitter:card" content="summary" />
              <meta name="twitter:site" content="@salvemaisum" />
              <meta name="twitter:creator" content="@salvemaisum" />
              <meta name="twitter:title" content="${post.title}" />
              <meta name="twitter:description" content="${post.description}" />
              <meta name="twitter:url" content="${post.url}">
              <meta name="twitter:image" content="${post.image}">

              <meta property="fb:app_id" content="1556153371537682" />
              <meta property="og:site_name" content="Salve Mais Um" />
              <meta property="og:type" content="article"/>
              <meta property="og:url" content="${post.url}" />
              <meta property="og:title" content="${post.title}" />
              <meta property="og:description" content="${post.description}" />
              <meta property="og:image" content="${post.image}" />
              <meta property="og:image:width" content="512" />
              <meta property="og:image:height" content="512" />
              <meta property="og:image:alt" content="${post.title}" />
            </head>
            <body>
            </body>
          </html>
        `);
      });

    // start express server
    app.listen(PORT)
    console.log(`SERVER IS ONLINE v1.0. Open http://localhost:${PORT}/users to see results`);
    
}).catch(error => console.log(error));
