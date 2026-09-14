import {getRepository} from "typeorm";
import {NextFunction, Request, Response} from "express";
import {ComponentExtra} from "../entity/ComponentExtra";
// var multer = require('multer')
const fs = require('fs')

var multer = require('multer')

var storage = multer.diskStorage({
    destination: function (req, file, cb) {
    cb(null, '../public/imgs')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' +file.originalname )
  }
})
var upload = multer({ storage: storage }).single('file')


export class ComponentExtraController {

    private componentExtraRepository = getRepository(ComponentExtra);

    async all(request: Request, response: Response, next: NextFunction) {
        return this.componentExtraRepository.find();
    }

    async one(request: Request, response: Response, next: NextFunction) {
        return this.componentExtraRepository.findOne(request.params.id);
    }

    async save(request: Request, response: Response, next: NextFunction) {
        if(request.body.component_id){
            var x = request.body.component_id;
            var y: number = +x;
            request.body.parent = y;
        }
        return this.componentExtraRepository.save(request.body);
    }

    async remove(request: Request, response: Response, next: NextFunction) {
        let extraToRemove = await this.componentExtraRepository.findOne(request.params.id);
        if (extraToRemove!.key_extra == 'img'){
            //Remove a imagem da pasta:
            try {
                fs.unlinkSync('../public/imgs/'+extraToRemove!.value_extra)
                //file removed
              } catch(err) {
                console.error(err)
              }

        }
        await this.componentExtraRepository.remove(extraToRemove!);
        
        return request.params.id; //retorna o id removido
    }

}







