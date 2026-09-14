import {getConnection, getRepository, Like} from "typeorm";
import {NextFunction, Request, Response} from "express";
import { Campaign } from "../entity/Campaign";
var bcrypt = require('bcrypt');

//let path = '../../aplicativo/public/files';
let path = '../../public_html/files';
const fs = require('fs')
const { promisify } = require('util')
const unlinkAsync = promisify(fs.unlink)

export class CampaignController {

    private campaignReposity = getRepository(Campaign);

    async all(request: Request, response: Response, next: NextFunction) {
        let take = +request.params.take
        let page = +request.params.page
        const [result, total] = await this.campaignReposity.findAndCount(

            {
                relations: ['parentUser', 'cityParent', 'stateParent', 'bcParent', 'bcParent.stateParent', 'bcParent.cityParent'],
                take,
                skip: take * (page - 1),
                order: {
                    id: 'DESC'
                }
            }
        );
        return {
            data: result,
            count: total,
        }
    }

    
    async allbig(request: Request, response: Response, next: NextFunction) {
        const [result, total] = await this.campaignReposity.findAndCount(

            {
                relations: ['parentUser', 'cityParent', 'stateParent', 'bcParent', 'bcParent.stateParent', 'bcParent.cityParent'],
                order: {
                    id: 'DESC'
                }
            }
        );
        return {
            data: result,
            count: total,
        }
    }

    async mycampaigns(request: Request, response: Response, next: NextFunction) {
        return this.campaignReposity.find(
            {
                relations: ['parentUser', 'cityParent', 'stateParent', 'bcParent', 'bcParent.stateParent', 'bcParent.cityParent'],
                where: {
                    parentUser: request.params.id,
                },
                order: {
                    id: 'DESC'
                }
            }
        );
    }

    async one(request: Request, response: Response, next: NextFunction) {
        return this.campaignReposity.findOne(request.params.id, {relations: ['parentUser', 'cityParent', 'stateParent', 'bcParent', 'bcParent.stateParent', 'bcParent.cityParent']});
    }

    async save(request: Request, response: Response, next: NextFunction) {
        if(request.body.user_id){
            var x = request.body.user_id;
            var y: number = +x;
            request.body.parentUser = y;
        }
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
            let componentToUpdate = await this.campaignReposity.findOne(request.body.id);
            try {
                await unlinkAsync(path + '/' + componentToUpdate.image)
            } catch (error) {
                console.log("nao consegui apagar a imagem", path + '/' + componentToUpdate.image)
            }
        }
        await this.campaignReposity.save(request.body);
        return await this.campaignReposity.findOne(request.body.id, {relations: ['parentUser', 'cityParent', 'stateParent', 'bcParent', 'bcParent.stateParent', 'bcParent.cityParent']});
        
    }

    
    async searchcampaign(request: Request, response: Response, next: NextFunction) {

        console.log("Buscando campanhas por ", request.params.search)
        return await this.campaignReposity.createQueryBuilder("campaign")
            // .leftJoinAndSelect("campaign.children", "children", "children.status = 1")
            
            .leftJoinAndSelect("campaign.parentUser", "parentUser")
            .leftJoinAndSelect("campaign.cityParent", "cityParent")
            .leftJoinAndSelect("campaign.stateParent", "stateParent")
            .leftJoinAndSelect("campaign.bcParent", "bcParent")
            .leftJoinAndSelect("bcParent.cityParent", "cityParentb")
            .leftJoinAndSelect("bcParent.stateParent", "stateParentb")
            
            .where("LOWER(campaign.name) like LOWER(:name)", { name:`%${request.params.search}%` })
            .orWhere("LOWER(cityParent.name) like LOWER(:name)", { name:`%${request.params.search}%` })
            .orWhere("LOWER(stateParent.name) like LOWER(:name)", { name:`%${request.params.search}%` })
            .orWhere("LOWER(stateParent.state) like LOWER(:name)", { name:`%${request.params.search}%` })

            .orWhere("LOWER(bcParent.name) like LOWER(:name)", { name:`%${request.params.search}%` })
            .orWhere("LOWER(cityParentb.name) like LOWER(:name)", { name:`%${request.params.search}%` })
            .orWhere("LOWER(stateParentb.state) like LOWER(:name)", { name:`%${request.params.search}%` })
            
            //.andWhere('component.status = 1')
            .orderBy('campaign.id', 'DESC')
            .getMany();
    }

    async searchcampaigncompatibility(request: Request, response: Response, next: NextFunction) {
        console.log("listBlood", request.params.listBlood)
        let listBlood = request.params.listBlood.split(',').map(Number);
        console.log("listBlood", listBlood)

        return await this.campaignReposity.createQueryBuilder("campaign")
        .select("COUNT(*)","cnt")
        //.leftJoinAndSelect("campaign.parentUser", "parentUser")
        // .leftJoinAndSelect("campaign.cityParent", "cityParent")
        // .leftJoinAndSelect("campaign.stateParent", "stateParent")
        // .leftJoinAndSelect("campaign.bcParent", "bcParent")
        // .leftJoinAndSelect("bcParent.cityParent", "bcParentb")
        // .leftJoinAndSelect("bcParent.stateParent", "stateParentb")
        .where("campaign.bloodtype IN (:listBlood)", { listBlood })
        .orderBy('campaign.id', 'DESC')
        .getRawOne();

    }

    async remove(request: Request, response: Response, next: NextFunction) {
        //console.log(request.params.id);
        let componentToRemove = await this.campaignReposity.findOne(request.params.id);
        await console.log("Remover", componentToRemove)
        //remove image:
        try {
            await unlinkAsync(path + '/' + componentToRemove.image)
        } catch (error) {
            console.log("nao consegui apagar a imagem", path + '/' + componentToRemove.image)
        }
        
        await this.campaignReposity.remove(componentToRemove!);
        return request.params.id; //retorna o id removido
    }

}