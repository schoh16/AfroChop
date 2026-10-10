import { Controller, Get, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('countries')
  getCountries() {
    return this.catalogService.getCountries();
  }

  @Get('market-countries')
  getMarketCountries() {
    return this.catalogService.getMarketCountries();
  }

  @Get('locations/states')
  getStates(@Query('countryCode') countryCode?: string) {
    return this.catalogService.getServiceAreaStates(countryCode);
  }

  @Get('locations/cities')
  getCities(
    @Query('countryCode') countryCode?: string,
    @Query('state') state?: string,
  ) {
    return this.catalogService.getServiceAreaCities(countryCode, state);
  }

  @Get('featured-dishes')
  getFeaturedDishes() {
    return this.catalogService.getFeaturedDishes();
  }

  @Get('chef-highlights')
  getChefHighlights() {
    return this.catalogService.getChefHighlights();
  }
}
