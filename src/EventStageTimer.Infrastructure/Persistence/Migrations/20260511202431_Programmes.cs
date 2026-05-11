using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EventStageTimer.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Programmes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ProgrammeSlotId",
                table: "ScheduleItems",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ProgrammeId",
                table: "Rooms",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Programmes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EventId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Programmes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Programmes_Events_EventId",
                        column: x => x.EventId,
                        principalTable: "Events",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProgrammeSlots",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProgrammeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Position = table.Column<int>(type: "int", nullable: false),
                    Label = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    StartUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DurationSec = table.Column<int>(type: "int", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProgrammeSlots", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProgrammeSlots_Programmes_ProgrammeId",
                        column: x => x.ProgrammeId,
                        principalTable: "Programmes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ScheduleItems_ProgrammeSlotId",
                table: "ScheduleItems",
                column: "ProgrammeSlotId");

            migrationBuilder.CreateIndex(
                name: "IX_Rooms_ProgrammeId",
                table: "Rooms",
                column: "ProgrammeId");

            migrationBuilder.CreateIndex(
                name: "IX_Programmes_EventId",
                table: "Programmes",
                column: "EventId");

            migrationBuilder.CreateIndex(
                name: "IX_ProgrammeSlots_ProgrammeId_Position",
                table: "ProgrammeSlots",
                columns: new[] { "ProgrammeId", "Position" });

            migrationBuilder.AddForeignKey(
                name: "FK_Rooms_Programmes_ProgrammeId",
                table: "Rooms",
                column: "ProgrammeId",
                principalTable: "Programmes",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_ScheduleItems_ProgrammeSlots_ProgrammeSlotId",
                table: "ScheduleItems",
                column: "ProgrammeSlotId",
                principalTable: "ProgrammeSlots",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Rooms_Programmes_ProgrammeId",
                table: "Rooms");

            migrationBuilder.DropForeignKey(
                name: "FK_ScheduleItems_ProgrammeSlots_ProgrammeSlotId",
                table: "ScheduleItems");

            migrationBuilder.DropTable(
                name: "ProgrammeSlots");

            migrationBuilder.DropTable(
                name: "Programmes");

            migrationBuilder.DropIndex(
                name: "IX_ScheduleItems_ProgrammeSlotId",
                table: "ScheduleItems");

            migrationBuilder.DropIndex(
                name: "IX_Rooms_ProgrammeId",
                table: "Rooms");

            migrationBuilder.DropColumn(
                name: "ProgrammeSlotId",
                table: "ScheduleItems");

            migrationBuilder.DropColumn(
                name: "ProgrammeId",
                table: "Rooms");
        }
    }
}
