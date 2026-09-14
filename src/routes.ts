import {UserController} from "./controller/UserController";
import {ComponentController} from "./controller/ComponentController";
import {ComponentExtraController} from './controller/ComponentExtraController';
import { CampaignController } from "./controller/CampaignController";
import { CityController } from "./controller/CityController";
import { StateController } from "./controller/StateController";
import { ContactController } from "./controller/ContactController";
import { BloodcenterController } from "./controller/BloodcenterController";


export const Routes = [

{
    method: "post",
    route: "/login",
    controller: UserController,
    action: "login"
}, {
    method: "post",
    route: "/loginadm",
    controller: UserController,
    action: "loginadm"
}, {
    method: "get",
    route: "/users/:page/:take",
    controller: UserController,
    action: "all"
}, {
    method: "get",
    route: "/users/:id",
    controller: UserController,
    action: "one"
}, {
    method: "get",
    route: "/userssearch/:search",
    controller: UserController,
    action: "search"
}, {
    method: "post",
    route: "/users",
    controller: UserController,
    action: "save"
}, {
    method: "post",
    route: "/userrecovery",
    controller: UserController,
    action: "userrecovery"
}, {
    method: "post",
    route: "/recovery",
    controller: UserController,
    action: "recovery"
}, {
    method: "delete",
    route: "/users/:id",
    controller: UserController,
    action: "remove"
}, {
    method: "post",
    route: "/confirm",
    controller: UserController,
    action: "confirm"
},

{
    method: "get",
    route: "/components",
    controller: ComponentController,
    action: "all"
}, {
    method: "get",
    route: "/search/:search",
    controller: ComponentController,
    action: "search"
}, {
    method: "get",
    route: "/componentsbydesc/:desc",
    controller: ComponentController,
    action: "onebydesc"
}, 
{
    method: "get",
    route: "/components/:id",
    controller: ComponentController,
    action: "one"
},
{
    method: "get",
    route: "/components/modules/:id/:user_id/:num_turma",
    controller: ComponentController,
    action: "modules"
    
}, {
    method: "get",
    route: "/components/classes/:id/:user_id",
    controller: ComponentController,
    action: "classes"
    
}, {
    method: "post",
    route: "/components",
    controller: ComponentController,
    action: "save"
}, {
    method: "delete",
    route: "/components/:id",
    controller: ComponentController,
    action: "remove"
}, {
    method: "get",
    route: "/readCourse/:id",
    controller: ComponentController,
    action: "readCourse"
},



{
    method: "get",
    route: "/extras",
    controller: ComponentExtraController,
    action: "all"
}, {
    method: "get",
    route: "/extras/:id",
    controller: ComponentExtraController,
    action: "one"
}, {
    method: "post",
    route: "/extras",
    controller: ComponentExtraController,
    action: "save"
}, {
    method: "delete",
    route: "/extras/:id",
    controller: ComponentExtraController,
    action: "remove"
},
{
    method: "get",
    route: "/campaigns",
    controller: CampaignController,
    action: "allbig"
},

{
    method: "get",
    route: "/campaigns/:page/:take",
    controller: CampaignController,
    action: "all"
}, {
    method: "get",
    route: "/mycampaigns/:id",
    controller: CampaignController,
    action: "mycampaigns"
}, {
    method: "get",
    route: "/searchcampaign/:search",
    controller: CampaignController,
    action: "searchcampaign"
},  {
    method: "get",
    route: "/searchcampaigncompatibility/:listBlood",
    controller: CampaignController,
    action: "searchcampaigncompatibility"
},{
    method: "get",
    route: "/campaign/:id",
    controller: CampaignController,
    action: "one"
}, {
    method: "post",
    route: "/campaign",
    controller: CampaignController,
    action: "save"
}, {
    method: "delete",
    route: "/campaign/:id",
    controller: CampaignController,
    action: "remove"
}, 


{
    method: "get",
    route: "/bloodcenters",
    controller: BloodcenterController,
    action: "all"
}, {
    method: "get",
    route: "/searchbloodcenter/:search",
    controller: BloodcenterController,
    action: "searchbloodcenter"
}, {
    method: "get",
    route: "/bloodcenter/:id",
    controller: BloodcenterController,
    action: "one"
}, {
    method: "post",
    route: "/bloodcenter",
    controller: BloodcenterController,
    action: "save"
}, {
    method: "delete",
    route: "/bloodcenter/:id",
    controller: BloodcenterController,
    action: "remove"
}, 


{
    method: "get",
    route: "/cities/:uf",
    controller: CityController,
    action: "all"
}, {
    method: "get",
    route: "/states",
    controller: StateController,
    action: "all"
}, 
{
    method: "get",
    route: "/contacts",
    controller: ContactController,
    action: "all"
}, {
    method: "get",
    route: "/contact/:id",
    controller: ContactController,
    action: "one"
}, {
    method: "post",
    route: "/contact",
    controller: ContactController,
    action: "save"
}, {
    method: "delete",
    route: "/contact/:id",
    controller: ContactController,
    action: "remove"
},

// select list, count(*) as number, count(case confirm when 'Confirm' then 1 else null end) as number_confirm from email group by list


];