const express = require('express');
const AddressController = require('../controllers/addressController');
const { verifyToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/', verifyToken, AddressController.getAddresses);
router.post('/', verifyToken, AddressController.createAddress);
router.put('/:id', verifyToken, AddressController.updateAddress);
router.delete('/:id', verifyToken, AddressController.deleteAddress);
router.patch('/:id/default', verifyToken, AddressController.setDefaultAddress);

module.exports = router;
