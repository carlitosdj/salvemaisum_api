import {getRepository} from "typeorm";
import {NextFunction, Request, Response} from "express";
import { City } from "../entity/City";
var bcrypt = require('bcrypt');

export class CityController {

    private cityRepository = getRepository(City);

    async all(request: Request, response: Response, next: NextFunction) {
        return this.cityRepository.find({
            where: {
                parentState: request.params.uf
            }
        });
    }

    async one(request: Request, response: Response, next: NextFunction) {
        return this.cityRepository.findOne(request.params.id);
    }

    async save(request: Request, response: Response, next: NextFunction) {
        return this.cityRepository.save(request.body);
    }

    async remove(request: Request, response: Response, next: NextFunction) {
        let userToRemove = await this.cityRepository.findOne(request.params.id);
        await this.cityRepository.remove(userToRemove!);
    }

}