import {getRepository} from "typeorm";
import {NextFunction, Request, Response} from "express";
import {Contact} from "../entity/Contact";

export class ContactController {

    private contactRepository = getRepository(Contact);

    async all(request: Request, response: Response, next: NextFunction) {
        return this.contactRepository.find();
    }


    async one(request: Request, response: Response, next: NextFunction) {
        return this.contactRepository.findOne(request.params.id);
    }

    async save(request: Request, response: Response, next: NextFunction) {
        // if(request.body.component_id){
        //     var x = request.body.component_id;
        //     var y: number = +x;
        //     request.body.parent = y;
        // }
        return this.contactRepository.save(request.body);
    }

    async remove(request: Request, response: Response, next: NextFunction) {
        let ContactToRemove = await this.contactRepository.findOne(request.params.id);
        await this.contactRepository.remove(ContactToRemove!);
        return request.params.id; //retorna o id removido
    }

}