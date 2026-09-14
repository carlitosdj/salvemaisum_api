import {EntityManager, getConnection, getManager, getRepository, Like, QueryBuilder, Raw} from "typeorm";
import {NextFunction, Request, Response} from "express";
import {Component} from "../entity/Component";
import { User } from '../entity/User'
const { v4: uuidv4 } = require('uuid'); 

export class ComponentController {

    private componentRepository = getRepository(Component);

    async all(request: Request, response: Response, next: NextFunction) {
        return this.componentRepository.find({
            // order: {
            //     order: 'ASC'
            // }
        });
    }

    async search(request: Request, response: Response, next: NextFunction) {
        // return this.componentRepository.find({
        //     where:[ 
        //         { tags: Like(`%${request.params.search}%`) },
        //     ],
        //     relations: ['parent']
        // });

        // return this.componentRepository.createQueryBuilder("component")
        // .leftJoinAndSelect("component.parent", "parent")
        // .where("component.tags like :tags", { tags:`%${request.params.search}%` })
        // .andWhere('component.status = 1')
        // .orderBy('component.order', 'ASC')
        // .getMany();

        const entityManager = getConnection().manager;
        
        const rawData = `
            select c.id, c.name, p.id parentId, p.name parentName, p.component_id firstId, cex.value_extra, c.duration from component c 
            left join component p
            on p.id = c.component_id
            left join component_extra cex
            on c.id = cex.component_id
            where c.tags like '%${request.params.search}%' and cex.key_extra = 'url'
                            `;
        const someQuery = entityManager.query(rawData);
        return someQuery;
    }

    async modules(request: Request, response: Response, next: NextFunction) {
        return await this.componentRepository.createQueryBuilder("component")
            .leftJoinAndSelect("component.children", "children", "children.status = 1")
            .leftJoinAndSelect("component.parent", "parent")
            .leftJoinAndSelect("component.componentavailable", "componentavailable", "componentavailable.turma_num = :turma_num", { turma_num: request.params.num_turma }) // TODO: puxar o numero da turma no request
            .leftJoinAndSelect("children.aulaconcluida", "aulaconcluida", "aulaconcluida.user_id = :user_id", { user_id: request.params.user_id }) //atenção para o children
            .where('component.component_id = :id', {id: request.params.id})
            .andWhere('component.status = 1')
            .orderBy('component.order', 'ASC')
            .addOrderBy('component.id', 'ASC')
            .getMany();
    }

    async classes(request: Request, response: Response, next: NextFunction) {

        return await this.componentRepository.createQueryBuilder("component")
            .leftJoinAndSelect("component.extras", "extras")
            .leftJoinAndSelect("component.parent", "parent")
            .leftJoinAndSelect("component.aulaconcluida", "aulaconcluida", "aulaconcluida.user_id = :user_id", { user_id: request.params.user_id }) //atenção para o component, diferente da requisição acima
            .where('component.component_id = :id', {id: request.params.id})
            .andWhere('component.status = 1')
            .orderBy('component.order', 'ASC')
            .addOrderBy('component.id', 'ASC')
            .getMany();
    }

    async onebydesc(request: Request, response: Response, next: NextFunction) {
        return this.componentRepository.findOne(request.params.id, { where: { description: request.params.desc }, relations: ['children', 'extras', 'parent'] });
    }
    

    async one(request: Request, response: Response, next: NextFunction) {
        return this.componentRepository.findOne(
            request.params.id, 
            {
                relations: ['children', 'children.extras', 'extras', 'parent'], 
                order: {
                    order: 'ASC'
                }
            }
        );
    }

    async save(request: Request, response: Response, next: NextFunction) {
        if(request.body.component_id){
            var x = request.body.component_id;
            var y: number = +x;
            request.body.parent = y;
        }
        

        console.log('save', request.body)
        return this.componentRepository.save(request.body);
    }

    async remove(request: Request, response: Response, next: NextFunction) {
        console.log(request.params.id);
        let componentToRemove = await this.componentRepository.findOne(request.params.id);
        await console.log("Remover", componentToRemove)
        
        await this.componentRepository.remove(componentToRemove!);
        return request.params.id; //retorna o id removido
    }

    async readCourse(request: Request, response: Response, next: NextFunction) {
        const entityManager = getConnection().manager;
        
        let id = request.params.id
        const rawData = `
                        select  id,
                        component_id,
                        name,
                        description,
                        created_at,
                        status,
                        \`order\`
                            from    (select * from component
                                order by component_id, \`order\` ASC) components_sorted,
                                (select @pv := '${id}') initialisation
                            where   find_in_set(component_id, @pv)
                            and     length(@pv := concat(@pv, ',', id))
                            or id = ${id}
                        order by \`order\` ASC
                            `;
        const someQuery = entityManager.query(rawData);
        return someQuery;
    }

}