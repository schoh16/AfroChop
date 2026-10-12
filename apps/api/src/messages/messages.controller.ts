import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import { MessagesService } from './messages.service.js';

class ConversationQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;
}

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  send(@Req() request: AuthenticatedRequest, @Body() dto: SendMessageDto) {
    return this.messagesService.send(request.user.sub, dto);
  }

  @Get('conversations')
  conversations(@Req() request: AuthenticatedRequest) {
    return this.messagesService.listConversations(request.user.sub);
  }

  @Get('unread-count')
  unreadCount(@Req() request: AuthenticatedRequest) {
    return this.messagesService.unreadCount(request.user.sub);
  }

  @Get('with/:userId')
  conversation(
    @Req() request: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) otherUserId: string,
    @Query() query: ConversationQueryDto,
  ) {
    return this.messagesService.conversation(
      request.user.sub,
      otherUserId,
      query.page,
      query.limit,
    );
  }
}
