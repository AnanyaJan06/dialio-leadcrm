import Contact from '../model/Contact.js';

export const addContact = async (req, res) => {
  try {
    const { name, phone, email, company } = req.body;
    const userId = req.user.id;

    const contact = await Contact.create({
      user: userId,
      name,
      phone,
      email,
      company
    });

    res.status(201).json({ message: 'Contact added', contact });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getContacts = async (req, res) => {
  try {
    const userId = req.user.id;
    const contacts = await Contact.find({ user: userId })
      .sort({ name: 1 });

    res.json(contacts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteContact = async (req, res) => {
  try {
    const userId = req.user.id;
    await Contact.findOneAndDelete({ _id: req.params.id, user: userId });
    res.json({ message: 'Contact deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};