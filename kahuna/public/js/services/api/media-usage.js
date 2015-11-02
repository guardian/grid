import apiServices from '../api';

apiServices.factory('mediaUsage', [function () {
    function getUsage(image) {
        return image.follow('usages').getData();
    }

    return {
        getUsage
    };
}]);
