import {onManageActiveEffect, prepareActiveEffectCategories} from "../helpers/effects.mjs";

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class VaultsOfRustrimActorSheet extends ActorSheet {

  /** @override */
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["vaultsofrustrim", "sheet", "actor"],
      template: "systems/vaultsofrustrim/templates/actor/actor-sheet.html",
      width: 600,
      height: 600,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "features" }]
    });
  }

  /** @override */
  get template() {
    return `systems/vaultsofrustrim/templates/actor/actor-${this.actor.data.type}-sheet.html`;
  }

  /* -------------------------------------------- */

  /** @override */
  getData() {
    // Retrieve the data structure from the base sheet. You can inspect or log
    // the context variable to see the structure, but some key properties for
    // sheets are the actor object, the data object, whether or not it's
    // editable, the items array, and the effects array.
    const context = super.getData();

    // Use a safe clone of the actor data for further operations.
    const actorData = this.actor.data.toObject(false);

    // Add the actor's data to context.data for easier access, as well as flags.
    context.data = actorData.data;
    context.flags = actorData.flags;

    // Prepare character data and items.
    if (actorData.type == 'character') {
      this._prepareItems(context);
      this._prepareCharacterData(context);
    }

    // Prepare NPC data and items.
    if (actorData.type == 'npc') {
      this._prepareItems(context);
    }

    // Add roll data for TinyMCE editors.
    context.rollData = context.actor.getRollData();

    // Prepare active effects
    context.effects = prepareActiveEffectCategories(this.actor.effects);

    return context;
  }

  /**
   * Organize and classify Items for Character sheets.
   *
   * @param {Object} actorData The actor to prepare.
   *
   * @return {undefined}
   */
  _prepareCharacterData(context) {
    // Handle ability scores.
    for (let [k, v] of Object.entries(context.data.abilities)) {
      v.label = game.i18n.localize(CONFIG.VAULTSOFRUSTRIM.abilities[k]) ?? k;
    }
    context.notAbilitiesGenerated = !this._areAbilitiesGenerated();
    context.notChargenComplete = !this._isChargenComplete();
  }

  /**
   * Organize and classify Items for Character sheets.
   *
   * @param {Object} actorData The actor to prepare.
   *
   * @return {undefined}
   */
  _prepareItems(context) {

    function _getItemRank(item) {
      var result = -1
      switch (item.type) {
        case 'effect':
        result = 0;
        break;
        case 'armor':
        result = 1;
        break;
        case 'weapon':
        result = 2;
        break;
        case 'item':
        result = 3;
        break;
      }
      return result;
    }

    // Initialize containers.
    const gear = [];

    // Iterate through items, allocating to containers
    for (let i of context.items) {
      i.img = i.img || DEFAULT_TOKEN;
      // Append to gear.
      if (i.type === 'armor' || i.type === 'weapon' || i.type === 'item' || i.type === 'effect') {
        gear.push(i);
      }
      gear.sort(function(a, b){
        return _getItemRank(a) - _getItemRank(b);
      });
    }

    // Assign and return
    context.gear = gear;
  }

  

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Render the item sheet for viewing/editing prior to the editable check.
    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.sheet.render(true);
    });

    // -------------------------------------------------------------
    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Character generation listeners
    html.find('.generate-health').click(this._onGenerateHealth.bind(this));
    html.find('.generate-ability').click(this._onGenerateAbility.bind(this));
    html.find('.roll-gear').click(this._onGenerateGear.bind(this));
    html.find('.complete-chargen').click(this._onChargenComplete.bind(this));

    // Add Inventory Item
    html.find('.item-create').click(this._onItemCreate.bind(this));


    // Delete Inventory Item
    html.find('.item-delete').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.items.get(li.data("itemId"));
      item.delete();
      li.slideUp(200, () => this.render(false));
    });

    // Active Effect management
    html.find(".effect-control").click(ev => onManageActiveEffect(ev, this.actor));

    // Abilities.
    html.find('.ability-rollable').click(this._onRollAbility.bind(this));

    // Rollable abilities.
    html.find('.rollable').click(this._onRoll.bind(this));

    // Drag events for macros.
    if (this.actor.owner) {
      let handler = ev => this._onDragStart(ev);
      html.find('li.item').each((i, li) => {
        if (li.classList.contains("inventory-header")) return;
        li.setAttribute("draggable", true);
        li.addEventListener("dragstart", handler, false);
      });
    }
  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */
  async _onItemCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    // Get the type of item to create.
    const type = header.dataset.type;
    // Grab any data associated with this control.
    const data = duplicate(header.dataset);
    // Initialize a default name.
    const name = `New ${type.capitalize()}`;
    // Prepare the item object.
    const itemData = {
      name: name,
      type: type,
      data: data
    };
    // Remove the type from the dataset since it's in the itemData.type prop.
    delete itemData.data["type"];

    // Finally, create the item!
    return await Item.create(itemData, {parent: this.actor});
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    // Handle item rolls.
    if (dataset.rollType) {
      if (dataset.rollType == 'item') {
        const itemId = element.closest('.item').dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) return item.roll();
      }
    }

    // Handle rolls that supply the formula directly.
    if (dataset.roll) {
      let label = dataset.label ? `[roll] ${dataset.label}` : '';
      let roll = new Roll(dataset.roll, this.actor.getRollData());
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label,
        rollMode: game.settings.get('core', 'rollMode'),
      });
      return roll;
    }
  }

  _onRollAbility(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    // Handle rolls that supply the formula directly.
    if (dataset.roll) {
      let label = dataset.label ? `${this.actor.name} utilise ${dataset.label}` : '';
      let roll = new Roll(dataset.roll, this.actor.getRollData());
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label,
        rollMode: game.settings.get('core', 'rollMode'),
      });
      return roll;
    }
  }

  _onGenerateHealth(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    let roll = new Roll(dataset.roll, this.actor.getRollData()).roll();
    roll.then(result => {
      this.actor.data.data.health.max = result.total;
      this.actor.data.data.health.value = result.total;
      this.actor.data.data.new.health = false;
      this.actor.update({
        "data.abilities": this.actor.data.data.abilities,
        "data.health": this.actor.data.data.health,
        "data.new": this.actor.data.data.new
      }).then(r => { this.render(); });
    });
    
    return roll;
  }

  _onGenerateAbility(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    let key = dataset.key;
    let roll = new Roll(dataset.roll, this.actor.getRollData()).roll();
    roll.then(result => {
      this.actor.data.data.abilities[key].value = result.total;
      this.actor.data.data.new[key] = false;
      this.actor.update({
        "data.abilities": this.actor.data.data.abilities,
        "data.new": this.actor.data.data.new
      }).then(r => { this.render(); });
    });
    
    return roll;
  }

  _onGenerateGear(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    let key = dataset.key;
    if (key === 'bonusGear') {
      if (this._areAbilitiesGenerated()) {
          const maxAbility = this._getHighestAbility();
          var tableName;
          if (maxAbility <= 2) {
            tableName = "Matériel Bonus";
          } else {
            tableName = "Armes";
          }
          this._drawAndAddToInventory(tableName, key);
        }
    } else if (key === 'gear1') {
      this._drawAndAddToInventory("Matériel d'Exploration I", key);
    } else if (key === 'gear2') {
      this._drawAndAddToInventory("Matériel d'Exploration II", key);
    }
  }

  _drawAndAddToInventory(tableName, key) {
    const table = game.tables.find(t => t.name === tableName);
    table.draw().then(tableResult => {
      const i = game.items.getName(tableResult.results[0].data.text);
      this.actor.createEmbeddedDocuments('Item', [i.toObject()]).then(r => {
        this.actor.data.data.new[key] = false;
        this.actor.update({
          "data.new": this.actor.data.data.new
        }).then(r => this.render());
      });
    });
  }

  _getHighestAbility() {
    const abilities = this.actor.data.data.abilities;
    return Math.max(abilities['str'].value,
      abilities['con'].value,
      abilities['dex'].value,
      abilities['int'].value,
      abilities['psy'].value,
      abilities['ego'].value);
  }

  _areAbilitiesGenerated() {
    return !this.actor.data.data.new['str'] &&
    !this.actor.data.data.new['con'] &&
    !this.actor.data.data.new['dex'] &&
    !this.actor.data.data.new['int'] &&
    !this.actor.data.data.new['psy'] &&
    !this.actor.data.data.new['ego'];
  }

  _isChargenComplete() {
    const keys = Object.keys(this.actor.data.data.new);
    var chargen = false;
    keys.forEach((key, index) => {
        chargen = chargen || this.actor.data.data.new[key];
    });
    return !chargen;
  }

  _onChargenComplete(event) {
    if (this._isChargenComplete()) {
      this.actor.update({
        "data.chargenComplete": true
      }).then(r => this.render());
    }
  }
}
