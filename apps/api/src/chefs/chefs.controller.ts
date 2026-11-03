import {
  Body,
  Delete,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import {
  ChefAvailabilityListDto,
  ChefMenuItemDto,
  ChefPermitDto,
  ChefProfileDto,
  ChefSocialLinksDto,
  ChefServiceAreasDto,
  FoodPhotoDto,
} from './dto/chef-profile.dto.js';
import { ChefMenuEntryDto, ChefMenuTemplateDto } from './dto/chef-menu.dto.js';
import { ChefSearchDto } from './dto/chef-search.dto.js';
import { ChefsService } from './chefs.service.js';
import { ChefOnboardingDto } from './dto/chef-onboarding.dto.js';

@Controller('chefs')
export class ChefsController {
  constructor(private readonly chefsService: ChefsService) {}

  @Post('me/onboarding')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  completeOnboarding(@Req() request: AuthenticatedRequest, @Body() dto: ChefOnboardingDto) {
    return this.chefsService.completeOnboarding(request.user.sub, dto);
  }

  @Get()
  search(@Query() query: ChefSearchDto) {
    return this.chefsService.search(query);
  }

  @Get(':id')
  getPublicProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.chefsService.getPublicProfile(id);
  }

  @Post('me/profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  saveProfile(@Req() request: AuthenticatedRequest, @Body() dto: ChefProfileDto) {
    return this.chefsService.saveProfile(request.user.sub, dto);
  }

  @Get('me/profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  getMyProfile(@Req() request: AuthenticatedRequest) {
    return this.chefsService.getMyProfile(request.user.sub);
  }

  @Get('me/social-links')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  getMySocialLinks(@Req() request: AuthenticatedRequest) {
    return this.chefsService.getMySocialLinks(request.user.sub);
  }

  @Patch('me/social-links')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  updateMySocialLinks(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChefSocialLinksDto,
  ) {
    return this.chefsService.updateMySocialLinks(request.user.sub, dto);
  }

  @Get('me/menu')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  getMyMenu(@Req() request: AuthenticatedRequest) {
    return this.chefsService.getMyMenu(request.user.sub);
  }

  @Post('me/menu')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  createMenuEntry(@Req() request: AuthenticatedRequest, @Body() dto: ChefMenuEntryDto) {
    return this.chefsService.createMenuEntry(request.user.sub, dto);
  }

  @Patch('me/menu/:entryId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  updateMenuEntry(
    @Req() request: AuthenticatedRequest,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body() dto: ChefMenuEntryDto,
  ) {
    return this.chefsService.updateMenuEntry(request.user.sub, entryId, dto);
  }

  @Delete('me/menu/:entryId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  deleteMenuEntry(
    @Req() request: AuthenticatedRequest,
    @Param('entryId', ParseUUIDPipe) entryId: string,
  ) {
    return this.chefsService.deleteMenuEntry(request.user.sub, entryId);
  }

  @Get('me/menu-templates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  getMyMenuTemplates(@Req() request: AuthenticatedRequest) {
    return this.chefsService.getMyMenuTemplates(request.user.sub);
  }

  @Post('me/menu-templates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  createMenuTemplate(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChefMenuTemplateDto,
  ) {
    return this.chefsService.createMenuTemplate(request.user.sub, dto);
  }

  @Delete('me/menu-templates/:templateId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  deleteMenuTemplate(
    @Req() request: AuthenticatedRequest,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ) {
    return this.chefsService.deleteMenuTemplate(request.user.sub, templateId);
  }

  @Post('me/food-photos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  addFoodPhoto(@Req() request: AuthenticatedRequest, @Body() dto: FoodPhotoDto) {
    return this.chefsService.addFoodPhoto(request.user.sub, dto);
  }

  @Put('me/menu')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  saveMenuItem(@Req() request: AuthenticatedRequest, @Body() dto: ChefMenuItemDto) {
    return this.chefsService.saveMenuItem(request.user.sub, dto);
  }

  @Put('me/availability')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  saveAvailability(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChefAvailabilityListDto,
  ) {
    return this.chefsService.saveAvailability(request.user.sub, dto);
  }

  @Put('me/service-areas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  saveServiceAreas(@Req() request: AuthenticatedRequest, @Body() dto: ChefServiceAreasDto) {
    return this.chefsService.saveServiceAreas(request.user.sub, dto);
  }

  @Post('me/permits')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  submitPermit(@Req() request: AuthenticatedRequest, @Body() dto: ChefPermitDto) {
    return this.chefsService.submitPermit(request.user.sub, dto);
  }
}
