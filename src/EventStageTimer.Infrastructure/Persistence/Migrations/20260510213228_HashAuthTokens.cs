using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EventStageTimer.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class HashAuthTokens : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Invitations_Token",
                table: "Invitations");

            migrationBuilder.DropPrimaryKey(
                name: "PK_AuthMagicLinks",
                table: "AuthMagicLinks");

            migrationBuilder.DropColumn(
                name: "Token",
                table: "Invitations");

            migrationBuilder.DropColumn(
                name: "Token",
                table: "AuthMagicLinks");

            migrationBuilder.AddColumn<string>(
                name: "TokenHash",
                table: "Invitations",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "TokenHash",
                table: "AuthMagicLinks",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddPrimaryKey(
                name: "PK_AuthMagicLinks",
                table: "AuthMagicLinks",
                column: "TokenHash");

            migrationBuilder.CreateIndex(
                name: "IX_Invitations_TokenHash",
                table: "Invitations",
                column: "TokenHash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Invitations_TokenHash",
                table: "Invitations");

            migrationBuilder.DropPrimaryKey(
                name: "PK_AuthMagicLinks",
                table: "AuthMagicLinks");

            migrationBuilder.DropColumn(
                name: "TokenHash",
                table: "Invitations");

            migrationBuilder.DropColumn(
                name: "TokenHash",
                table: "AuthMagicLinks");

            migrationBuilder.AddColumn<string>(
                name: "Token",
                table: "Invitations",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Token",
                table: "AuthMagicLinks",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddPrimaryKey(
                name: "PK_AuthMagicLinks",
                table: "AuthMagicLinks",
                column: "Token");

            migrationBuilder.CreateIndex(
                name: "IX_Invitations_Token",
                table: "Invitations",
                column: "Token",
                unique: true);
        }
    }
}
