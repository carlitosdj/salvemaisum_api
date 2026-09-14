import {getRepository} from "typeorm";
import {NextFunction, Request, Response} from "express";
import {Profile} from "../entity/Profile";
var bcrypt = require('bcrypt');

export class ProfileController {

    private profileRepository = getRepository(Profile);

    async login(request: Request, response: Response, next: NextFunction) {
        const test = await this.profileRepository.findOne({ relations: ['user'], where: { user: { email: request.body.email } } } )
        await console.log('heey',  request.body.email )
        await console.log('test',  test )
        return test;
    }

    async all(request: Request, response: Response, next: NextFunction) {
        return this.profileRepository.find();
    }

    async one(request: Request, response: Response, next: NextFunction) {
        return this.profileRepository.findOne(request.params.id);
    }

    async save(request: Request, response: Response, next: NextFunction) {
        return this.profileRepository.save(request.body);
    }

    async remove(request: Request, response: Response, next: NextFunction) {
        let userToRemove = await this.profileRepository.findOne(request.params.id);
        await this.profileRepository.remove(userToRemove!);
    }

}