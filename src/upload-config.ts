const multer = require('multer')
const path = require('path')

let pathSave = '../../aplicativo/public';
module.exports = {
    storage : new multer.diskStorage({
        destination : path.resolve(__dirname, pathSave,"files"),
        filename : function(req, file, callback) {
            callback(null, file.originalname)
        }
    })
}