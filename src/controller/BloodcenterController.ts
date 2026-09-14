import {getConnection, getRepository, Like} from "typeorm";
import {NextFunction, Request, Response} from "express";
import { Campaign } from "../entity/Campaign";
import { Bloodcenter } from "../entity/Bloodcenter";
var bcrypt = require('bcrypt');

//let path = '../../aplicativo/public/files';
let path = '../../public_html/files';
const fs = require('fs')
const { promisify } = require('util')
const unlinkAsync = promisify(fs.unlink)

export class BloodcenterController {

    private bloodcenterRepository = getRepository(Bloodcenter);

    // async all(request: Request, response: Response, next: NextFunction) {
    //     let take = +request.params.take
    //     let page = +request.params.page
    //     const [result, total] = await this.bloodcenterRepository.findAndCount(

    //         {
    //             relations: ['parentUser', 'cityParent', 'stateParent'],
    //             take,
    //             skip: take * (page - 1),
    //             order: {
    //                 id: 'DESC'
    //             }
    //         }
    //     );
    //     return {
    //         data: result,
    //         count: total,
    //     }
    // }

    
    async all(request: Request, response: Response, next: NextFunction) {
        return await this.bloodcenterRepository.find(
            {
                relations: ['cityParent', 'stateParent'],
                order: {
                    name: 'ASC'
                }
            }
        );
        
    }

    async one(request: Request, response: Response, next: NextFunction) {
        return this.bloodcenterRepository.findOne(request.params.id, {relations: ['cityParent', 'stateParent', 'campaigns']});
    }

    async save(request: Request, response: Response, next: NextFunction) {
        if(request.body.bccity){
            var z = request.body.bccity;
            var w: number = +z;
            request.body.cityParent = w;
        }
        if(request.body.bcstate){
            var a = request.body.bcstate;
            var b: number = +a;
            request.body.stateParent = b;
        }
        //É um item para alteração? Se for, tem nova foto? Então remove a imagem anterior do servidor:
        if(request.body.id && request.body.image) {
            console.log("Tem que dar upload na imagem, e é item para alterar")
            let componentToUpdate = await this.bloodcenterRepository.findOne(request.body.id);
            try {
                await unlinkAsync(path + '/' + componentToUpdate.image)
            } catch (error) {
                console.log("nao consegui apagar a imagem", path + '/' + componentToUpdate.image)
            }
        }
        await this.bloodcenterRepository.save(request.body);
        return await this.bloodcenterRepository.findOne(request.body.id, {relations: ['cityParent', 'stateParent']});
        
    }

    
    async searchbloodcenter(request: Request, response: Response, next: NextFunction) {

        console.log("Buscando por ", request.params.search)
        return await this.bloodcenterRepository.createQueryBuilder("bloodcenter")
            // .leftJoinAndSelect("campaign.children", "children", "children.status = 1")
            .leftJoinAndSelect("bloodcenter.cityParent", "cityParent")
            .leftJoinAndSelect("bloodcenter.stateParent", "stateParent")
            // .leftJoinAndSelect("component.componentavailable", "componentavailable", "componentavailable.turma_num = :turma_num", { turma_num: request.params.num_turma }) // TODO: puxar o numero da turma no request
            // .leftJoinAndSelect("children.aulaconcluida", "aulaconcluida", "aulaconcluida.user_id = :user_id", { user_id: request.params.user_id }) //atenção para o children
            .where("LOWER(bloodcenter.name) like LOWER(:name)", { name:`%${request.params.search}%` })
            .orWhere("LOWER(cityParent.name) like LOWER(:name)", { name:`%${request.params.search}%` })
            .orWhere("LOWER(stateParent.name) like LOWER(:name)", { name:`%${request.params.search}%` })
            .orWhere("LOWER(stateParent.state) like LOWER(:name)", { name:`%${request.params.search}%` })
            
            //.andWhere('component.status = 1')
            .orderBy('bloodcenter.id', 'DESC')
            .getMany();
    }

    async remove(request: Request, response: Response, next: NextFunction) {
        console.log(request.params.id);
        let componentToRemove = await this.bloodcenterRepository.findOne(request.params.id);
        await console.log("Remover", componentToRemove)
        //remove image:
        try {
            await unlinkAsync(path + '/' + componentToRemove.image)
        } catch (error) {
            console.log("nao consegui apagar a imagem", path + '/' + componentToRemove.image)
        }
        
        await this.bloodcenterRepository.remove(componentToRemove!);
        return request.params.id; //retorna o id removido
    }

}