import {getRepository, Like} from "typeorm";
import {NextFunction, Request, Response} from "express";
import {User} from "../entity/User";
import {Profile} from "../entity/Profile";
import SendMailController from './SendMailController';
var bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid'); 

export class UserController {

    private userRepository = getRepository(User);
    private profileRepository = getRepository(Profile);

     async login(request: Request, response: Response, next: NextFunction) {

        //const user = await this.userRepository.findOne({ relations: ['profile', 'profile.cityParent', 'profile.stateParent'], where: { email: request.body.email } } );

        const user = await this.userRepository.createQueryBuilder("user")
            // .leftJoinAndSelect("campaign.children", "children", "children.status = 1")
            .leftJoinAndSelect("user.profile", "profile")
            .leftJoinAndSelect("profile.cityParent", "cityParent")
            .leftJoinAndSelect("profile.stateParent", "stateParent")
            .where("LOWER(user.email) = LOWER(:email)", { email:`${request.body.email}` })
            .getOne();
            //.andWhere('component.status = 1')
            //.orderBy('campaign.id', 'DESC')
            //.getMany();

        console.log('user',user)
        console.log('user',request.body)
        // return user;
        
        try {

            if(bcrypt.compareSync(request.body.password, user!.password_hash)){ 
                return user
            }
            else{
                // return { error: 'Something failed!' };
                throw new Error('Login/Senha inválidos')
            } 
            
        } catch (error) {
            throw new Error('Login/Senha inválidos')
        }

        
    }

    async loginadm(request: Request, response: Response, next: NextFunction) {

        //const user = await this.userRepository.findOne({ relations: ['profile', 'profile.cityParent', 'profile.stateParent'], where: { email: request.body.email } } );
        console.log("login admin...")
        const user = await this.userRepository.createQueryBuilder("user")
            // .leftJoinAndSelect("campaign.children", "children", "children.status = 1")
            .leftJoinAndSelect("user.profile", "profile")
            .leftJoinAndSelect("profile.cityParent", "cityParent")
            .leftJoinAndSelect("profile.stateParent", "stateParent")
            .where("LOWER(user.email) = LOWER(:email)", { email:`${request.body.email}` })
            .andWhere('user.flags = 1')
            .getOne();
            //.andWhere('component.status = 1')
            //.orderBy('campaign.id', 'DESC')
            //.getMany();

        console.log('user',user)
        console.log('user',request.body)
        // return user;
        
        try {

            if(bcrypt.compareSync(request.body.password, user!.password_hash)){ 
                return user
            }
            else{
                // return { error: 'Something failed!' };
                throw new Error('Login/Senha inválidos')
            } 
            
        } catch (error) {
            throw new Error('Login/Senha inválidos')
        }

        
    }

    async userExists(request: Request, response: Response, next: NextFunction) {
        return await this.userRepository.findOne({ relations: ['profile'], where: { email: request.params.email } } )
        //await Profile.exists({ where: { email: email } })
    }

    async all(request: Request, response: Response, next: NextFunction) {
        //return this.userRepository.find({ relations: ['profile'] })
        let take = +request.params.take
        let page = +request.params.page
        const [result, total] = await this.userRepository.findAndCount({
            relations: ['profile', 'profile.cityParent', 'profile.stateParent'],
            take,
            skip: take * (page - 1),
            order: {
                id: 'DESC'
            }
        });
        return {
            data: result,
            count: total,
        }
    }

    async one(request: Request, response: Response, next: NextFunction) {
        return this.userRepository.findOne(request.params.id, { relations: ['profile', 'profile.cityParent', 'profile.stateParent'] });
    }

    
    async confirm(request: Request, response: Response, next: NextFunction) {
        let user = await this.userRepository.findOne({ relations: ['profile'], where: { email: request.body.email } } )
        if(user) {
            if(user.auth_key === request.body.auth_key) {
                user.auth_key = 'Confirmed';
                user.confirmed_at = request.body.confirmed_at;
                const saved = await this.userRepository.save(user)
                console.log("Usuario confirmado", user)
                return 'Usuário confirmado com sucesso.'
            } else {
                if(user.auth_key === 'Confirmed'){
                    return 'Usuário já está confirmado.';
                } else {
                    throw new Error('Chave inválida, repita o processo.')
                }
                
            }
        } else {
            throw new Error('Usuário inexistente')
        }
        

        //await Profile.exists({ where: { email: email } })
    }

    async save(request: Request, response: Response, next: NextFunction) {
        
        
        // if(request.body.profile.user_id) 
        //     request.body.profileUserId = request.body.profile.user_id;
        if(request.body.profile){
            if(request.body.profile.city){
                request.body.profile.cityParent = request.body.profile.city
            }
            if(request.body.profile.state){
                request.body.profile.stateParent = request.body.profile.state
            }
        }
        
        //Novo usuario
        if(!request.body.id) {

            console.log("Trying to register user...", request.body)
            const userCheck = await this.userRepository.findOne({ relations: ['profile', 'profile.cityParent', 'profile.stateParent'], where: { email: request.body.email } } )
            if (userCheck) {
                console.log("Usuario já existe")
                throw new Error('User already exists')
            } else {
                console.log("Usuario nao existe, prossiga..")
            }
    
            // save profiles
            console.log("chamou save")
            if(request.body.profile) {
                const profile = await this.profileRepository.save(request.body.profile)
                
            }
            request.body.auth_key = uuidv4();
            let pass = request.body.password_hash
            request.body.password_hash = await bcrypt.hash(request.body.password_hash, 10)    
            

            SendMailController(
                request.body.email, 
                'Salve mais um - Confirme seu email', 
                '<center>' +
                    '<table align="center" cellspacing="0" cellpadding="0" width="100%">' +
                    '<tr>' +
                        '<td align="center" style="padding: 10px;">' +
                            '<span style="text-decoration: none; font-size: 20px; font-family: Helvetica, Arial, sans-serif; color: #000000; font-weight:normal; line-height:1.5em; text-align:center;"><b>Salve Mais Um</b></span>' +
                            '<br/>' +
                            '<span style="text-decoration: none; font-size: 16px; font-family: Helvetica, Arial, sans-serif; color: #000000; font-weight:normal; line-height:1.5em; text-align:center;">Dados de acesso</span>' +
                            '<br/>' +
                            '<span style="text-decoration: none; font-size: 16px; font-family: Helvetica, Arial, sans-serif; color: #000000; font-weight:normal; line-height:1.5em; text-align:center;">Login: ' + request.body.email + '</span>' +
                            '<br/>' +
                            '<span style="text-decoration: none; font-size: 16px; font-family: Helvetica, Arial, sans-serif; color: #000000; font-weight:normal; line-height:1.5em; text-align:center;">Senha: ' + pass + '</span>' +
                        '</td>'+
                    '</tr>' +
                    '<tr>' +
                        '<td align="center" style="padding: 10px;">' +
                        '<table border="0" class="mobile-button" cellspacing="0" cellpadding="0">' +
                            '<tr>'+
                            '<td align="center" bgcolor="#cf3533" style="background-color: #cf3533; margin: auto; max-width: 600px; -webkit-border-radius: 5px; -moz-border-radius: 5px; border-radius: 5px; padding: 15px 20px; " width="100%">' +
                            '<!--[if mso]>&nbsp;<![endif]-->'+
                                '<a href="https://salvemaisum.com.br/auth/confirm/'+request.body.email+'/'+request.body.auth_key+'" target="_blank" style="16px; font-family: Helvetica, Arial, sans-serif; color: #ffffff; font-weight:normal; text-align:center; background-color: #cf3533; text-decoration: none; border: none; -webkit-border-radius: 5px; -moz-border-radius: 5px; border-radius: 5px; display: inline-block;">'+
                                    '<span style="font-size: 16px; font-family: Helvetica, Arial, sans-serif; color: #ffffff; font-weight:normal; line-height:1.5em; text-align:center;">Clique aqui para confirmar seu email</span>' +
                                '</a>' +
                            '<!--[if mso]>&nbsp;<![endif]-->' +
                            '</td>' +
                            '</tr>' +
                        '</table>' +
                        '</td>' +
                    '</tr>' +
                    '</table>' +
                '</center>'

            )
        } else {

            // save profiles
            console.log("chamou save profile")
            if(request.body.profile) {
                const profile = await this.profileRepository.save(request.body.profile)
            }
        }


        //Se existir novo password:
        if(request.body.newPassword){
            request.body.password_hash = await bcrypt.hash(request.body.newPassword, 10)
        }

        

        console.log("request.body", request.body)
        const userToSave = await this.userRepository.save(request.body)
        const user = await this.userRepository.findOne(userToSave.id, { relations: ['profile', 'profile.cityParent', 'profile.stateParent'] } )
        // console.log("userToSave", userToSave)
        // console.log("changed", user)
        return user;
        
    }

    async search(request: Request, response: Response, next: NextFunction) {
        console.log("buscando por:", request.params.search)
        const result = await this.userRepository
        .createQueryBuilder("user")
        .leftJoinAndSelect("user.profile", "profile")
        .where("user.email like :searcha", { searcha: `%${request.params.search}%` })
        .where("user.username like :searchb", { searchb: `%${request.params.search}%` })
        .orWhere("profile.name like :searchc", { searchc: `%${request.params.search}%` })
        .orWhere("profile.whatsapp like :searchd", { searchd: `%${request.params.search}%` })
        .orWhere("profile.cpf like :searche", { searche: `%${request.params.search}%` })
        .orWhere("profile.endereco like :searchf", { searchf: `%${request.params.search}%` })
        .getMany();
        return {
            data: result,
            count: 0,
        }
    }

    async remove(request: Request, response: Response, next: NextFunction) {
        let userToRemove = await this.userRepository.findOne(request.params.id);
        await this.userRepository.remove(userToRemove!);
        return request.params.id
    }

    //Envia e-mail para troca de senha:
    async recovery(request: Request, response: Response, next: NextFunction) {
        console.log('Recovery', request.body)
        const user = await this.userRepository.findOne({ relations: ['profile', 'profile.cityParent', 'profile.stateParent'], where: { email: request.body.email } } )

        if(user){ 
            //Seta auth_key com uuid
            
            user.auth_key = uuidv4();
            //salva
            this.userRepository.save(user); 
            //envia email
            SendMailController(
                request.body.email, 
                'Recuperar senha - Salve mais um', 
                '<center>' +
                    '<table align="center" cellspacing="0" cellpadding="0" width="100%">' +
                    '<tr>' +
                        '<td align="center" style="padding: 10px;">' +
                            '<span style="text-decoration: none; font-size: 20px; font-family: Helvetica, Arial, sans-serif; color: #000000; font-weight:normal; line-height:1.5em; text-align:center;"><b>Clique no botão abaixo para alterar sua senha</b></span>' +
                        '</td>'+
                    '</tr>' +
                    '<tr>' +
                        '<td align="center" style="padding: 10px;">' +
                        '<table border="0" class="mobile-button" cellspacing="0" cellpadding="0">' +
                            '<tr>'+
                            '<td align="center" bgcolor="#cf3533" style="background-color: #cf3533; margin: auto; max-width: 600px; -webkit-border-radius: 5px; -moz-border-radius: 5px; border-radius: 5px; padding: 15px 20px; " width="100%">' +
                            '<!--[if mso]>&nbsp;<![endif]-->'+
                                '<a href="https://salvemaisum.com.br/auth/change/'+user.email+'/'+user.auth_key+'" target="_blank" style="16px; font-family: Helvetica, Arial, sans-serif; color: #ffffff; font-weight:normal; text-align:center; background-color: #cf3533; text-decoration: none; border: none; -webkit-border-radius: 5px; -moz-border-radius: 5px; border-radius: 5px; display: inline-block;">'+
                                    '<span style="font-size: 16px; font-family: Helvetica, Arial, sans-serif; color: #ffffff; font-weight:normal; line-height:1.5em; text-align:center;">Clique aqui para alterar sua senha</span>' +
                                '</a>' +
                            '<!--[if mso]>&nbsp;<![endif]-->' +
                            '</td>' +
                            '</tr>' +
                        '</table>' +
                        '</td>' +
                    '</tr>' +
                    '</table>' +
                '</center>'
            )
            return { msg: 'Ok!' }
        }else{
            return { error: 'Usuário não encontrado.' }
        } 
    }

    //Retorna usuário que está fazendo recovery
    async userrecovery(request: Request, response: Response, next: NextFunction) {
        console.log('Recovery', request.body)
        const userCheck = await this.userRepository.findOne({ relations: ['profile', 'profile.cityParent', 'profile.stateParent'], where: { email: request.body.email, auth_key: request.body.auth_key } } )

        if (userCheck) {
            return userCheck
        } else {
            console.log("Chave inválida")
            throw new Error('Chave inválida')
        }
    }

}