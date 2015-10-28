import angular from 'angular';

import './search';
import './results';
import './image';

export const routes = angular.module('gr.routes', [
    'gr.routes.search',
    'gr.routes.results',
    'gr.routes.image'
]);
