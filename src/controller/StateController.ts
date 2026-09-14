import {getRepository} from "typeorm";
import {NextFunction, Request, Response} from "express";
import { State } from "../entity/State";
var bcrypt = require('bcrypt');

export class StateController {

    private stateRepository = getRepository(State);

    async all(request: Request, response: Response, next: NextFunction) {
        return this.stateRepository.find();
    }

    async one(request: Request, response: Response, next: NextFunction) {
        return this.stateRepository.findOne(request.params.id);
    }

    async save(request: Request, response: Response, next: NextFunction) {
        return this.stateRepository.save(request.body);
    }

    async remove(request: Request, response: Response, next: NextFunction) {
        let userToRemove = await this.stateRepository.findOne(request.params.id);
        await this.stateRepository.remove(userToRemove!);
    }

}